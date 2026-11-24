/**
 * Prototype-pollution gadget resistance (axios GHSA-pf86-5x62-jrwf / CVE-2026-42033,
 * GHSA-q8qp-cvcw-x6jj / CVE-2026-42264, GHSA-6chq-wfr3-2hj9 / CVE-2026-42035,
 * GHSA-35jp-ww65-95wh / CVE-2026-44494, GHSA-3g43-6gmg-66jw / CVE-2026-44495,
 * GHSA-654m-c8p4-x5fp / CVE-2026-44489, GHSA-898c-q2cr-xwhg / CVE-2026-44490,
 * GHSA-w9j2-pvgh-6h63 / CVE-2026-42041, GHSA-7q8q-rj6j-mhjq / CVE-2026-67319,
 * GHSA-gcfj-64vw-6mp9 / CVE-2026-67320, GHSA-mmx7-hfxf-jppx / CVE-2026-67316,
 * GHSA-xj6q-8x83-jv6g / CVE-2026-67314, GHSA-9fr6-4gfg-395g / CVE-2026-101902,
 * GHSA-j8rh-479h-cp32 / CVE-2026-101904, GHSA-m8m8-qj5v-23w3 / CVE-2026-101905,
 * GHSA-vh66-26gq-q6x8 / CVE-2026-101908).
 *
 * Runs in its own process (node --test isolates files). Object.prototype is
 * polluted with the keys those gadgets abuse; requests must behave exactly
 * as configured.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHttpClient, NETWORK } from '../src/index.js';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';

function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ametherian-pp-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'),
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const cert = makeCert();
const seen = [];
let gadgetCalls = 0;
const gadget = () => {
  gadgetCalls++;
  throw new Error('polluted gadget was called');
};

const POLLUTION = {
  // request construction
  method: 'DELETE',
  json: { injected: true },
  body: 'injected-body',
  baseUrl: 'http://evil.invalid',
  allowAbsoluteUrls: true,
  maxRedirects: 50,
  maxResponseBytes: 1e12,
  throwOnStatus: false,
  stream: true,
  retry: { retries: 50 },
  shouldRetry: () => true,
  onRetry: gadget,
  validateStatus: () => true,
  // proxy / transport / connection
  proxy: 'http://127.0.0.1:9',
  http2: true,
  transport: gadget,
  createConnection: gadget,
  socketPath: '/nonexistent/ametherian.sock',
  lookup: gadget,
  localAddress: '203.0.113.1',
  auth: 'attacker:password',
  agent: false,
  insecureHTTPParser: true,
  setHost: false,
  // `signal` is deliberately absent: Node's own stream constructors read options.signal from
  // internal object literals, so a polluted signal aborts every stream in the process. That is a
  // runtime-level gadget no library can shadow (see docs/vulnerability-model.md, residual risks).
  // TLS
  rejectUnauthorized: false,
  checkServerIdentity: () => undefined,
  ca: 'not a certificate',
  servername: 'evil.invalid',
  minVersion: 'TLSv1',
  // headers
  'x-polluted': 'yes',
  authorization: 'Bearer stolen',
};

function pollute() {
  for (const [k, v] of Object.entries(POLLUTION)) {
    Object.defineProperty(Object.prototype, k, { value: v, configurable: true, writable: true, enumerable: false });
  }
}
function cleanup() {
  for (const k of Object.keys(POLLUTION)) delete Object.prototype[k];
}

let plain;
let plainPort;
let secure;
let securePort;
let h2;
let h2Port;
const record = (req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    // rawHeaders is what was on the wire; a plain object copy would read inherited (polluted) keys.
    const sent = Object.create(null);
    for (let i = 0; i < req.rawHeaders.length; i += 2) sent[req.rawHeaders[i].toLowerCase()] = req.rawHeaders[i + 1];
    seen.push({ method: req.method, url: req.url, headers: sent, body });
    res.end('ok');
  });
};

before(async () => {
  plain = http.createServer(record);
  plainPort = await new Promise((r) => plain.listen(0, '127.0.0.1', () => r(plain.address().port)));
  if (cert) {
    secure = https.createServer({ key: cert.key, cert: cert.cert }, record);
    securePort = await new Promise((r) => secure.listen(0, '127.0.0.1', () => r(secure.address().port)));
  }
  h2 = http2.createServer();
  h2.on('stream', (st, headers) => {
    const sent = Object.create(null);
    for (const k of Object.keys(headers)) sent[k] = headers[k];
    seen.push({ method: headers[':method'], url: headers[':path'], headers: sent, body: '' });
    st.respond({ ':status': 200 });
    st.end('ok');
  });
  h2Port = await new Promise((r) => h2.listen(0, '127.0.0.1', () => r(h2.address().port)));
});

after(async () => {
  cleanup();
  for (const s of [plain, secure, h2]) {
    if (!s) continue;
    s.closeAllConnections?.();
    await new Promise((r) => s.close(() => r()));
  }
});

test('HTTP/1.1 requests ignore every polluted option', async () => {
  const client = createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), retry: false });
  pollute();
  try {
    seen.length = 0;
    const res = await client.get(`http://127.0.0.1:${plainPort}/clean`, { headers: { accept: 'text/plain' } });
    assert.equal(res.text(), 'ok');
    assert.equal(seen.length, 1);
    const s = seen[0];
    assert.equal(s.method, 'GET');
    assert.equal(s.url, '/clean');
    assert.equal(s.body, '');
    assert.equal(s.headers['x-polluted'], undefined);
    assert.equal(s.headers.authorization, undefined, 'no inherited Authorization / auth');
    assert.equal(s.headers.host, `127.0.0.1:${plainPort}`);
    assert.equal(gadgetCalls, 0);
  } finally {
    cleanup();
    client.close();
  }
});

test('TLS verification cannot be disabled through the prototype', { skip: !cert && 'openssl not available' }, async () => {
  const client = createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), retry: false });
  pollute();
  try {
    seen.length = 0;
    await assert.rejects(client.get(`https://127.0.0.1:${securePort}/`), { code: NETWORK }, 'self-signed cert must still be rejected');
    assert.equal(seen.length, 0);
    assert.equal(gadgetCalls, 0);
  } finally {
    cleanup();
    client.close();
  }
  // Control: with the right CA (and no pollution) the same request succeeds.
  const trusted = createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), ca: cert.cert, retry: false });
  assert.equal((await trusted.get(`https://127.0.0.1:${securePort}/`)).text(), 'ok');
  trusted.close();
});

test('HTTP/2 requests ignore polluted options', async () => {
  const client = createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), http2: true, retry: false });
  pollute();
  try {
    seen.length = 0;
    assert.equal((await client.get(`http://127.0.0.1:${h2Port}/h2`)).text(), 'ok');
    assert.equal(seen[0].method, 'GET');
    assert.equal(seen[0].headers['x-polluted'], undefined);
    assert.equal(seen[0].headers.authorization, undefined);
    assert.equal(gadgetCalls, 0);
  } finally {
    cleanup();
    client.close();
  }
});

test('creating a client and policy while polluted uses safe defaults', async () => {
  pollute();
  let client;
  try {
    client = createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), retry: false });
    seen.length = 0;
    const res = await client.post(`http://127.0.0.1:${plainPort}/post`, { body: 'mine' });
    assert.equal(res.text(), 'ok');
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].body, 'mine');
    assert.equal(gadgetCalls, 0);
    // The default policy created under pollution still blocks private destinations.
    const strict = createHttpClient({ retry: false });
    await assert.rejects(strict.get('http://169.254.169.254/'), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
    strict.close();
  } finally {
    cleanup();
    client?.close();
  }
});
