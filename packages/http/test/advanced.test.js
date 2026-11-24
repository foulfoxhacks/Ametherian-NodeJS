import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import net from 'node:net';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHttpClient, HTTP_STATUS, NETWORK } from '../src/index.js';
import { createDestinationPolicy, DESTINATION_BLOCKED } from '@foulfoxhacks/ametherian-guard';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

/** Throwaway self-signed cert for 127.0.0.1/localhost, generated per run. Null if openssl is unavailable. */
function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ametherian-tls-'));
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
      '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ], { stdio: 'ignore' });
    return { key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const loopback = () => createDestinationPolicy({ allowCategories: ['loopback'] });
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = (server) => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });

function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/stream') {
    res.write('a'.repeat(10));
    setTimeout(() => res.end('b'.repeat(10)), 10);
  } else if (url.pathname === '/big') {
    res.end(Buffer.alloc(4096));
  } else if (url.pathname === '/slow-body') {
    res.write('start');
    setTimeout(() => res.end('end'), 500);
  } else if (url.pathname === '/gzip') {
    res.setHeader('content-encoding', 'gzip');
    res.end(zlib.gzipSync('zipped'));
  } else if (url.pathname === '/missing') {
    res.statusCode = 404;
    res.end('not here');
  } else if (url.pathname === '/to-other') {
    res.statusCode = 302;
    res.setHeader('location', url.searchParams.get('to'));
    res.end();
  } else {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ path: url.pathname, headers: req.headers }));
  }
}

let plain;
let plainPort;
let other;
let otherPort;
const otherSaw = [];
let cert;

before(async () => {
  plain = http.createServer(handler);
  plainPort = await listen(plain);
  other = http.createServer((req, res) => {
    otherSaw.push(req.headers);
    res.end('other');
  });
  otherPort = await listen(other);
  cert = makeCert();
});

after(async () => {
  await close(plain);
  await close(other);
});

test('streaming body arrives in chunks and respects the size limit', async () => {
  const c = createHttpClient({ policy: loopback() });
  const res = await c.get(`http://127.0.0.1:${plainPort}/stream`, { stream: true });
  let text = '';
  for await (const chunk of res.body) text += new TextDecoder().decode(chunk);
  assert.equal(text, 'a'.repeat(10) + 'b'.repeat(10));

  const big = await c.get(`http://127.0.0.1:${plainPort}/big`, { stream: true, maxResponseBytes: 1000 });
  await assert.rejects(big.bytes(), { code: ErrorCodes.LIMIT_EXCEEDED });

  const gz = await c.get(`http://127.0.0.1:${plainPort}/gzip`, { stream: true });
  assert.equal(await gz.text(), 'zipped');
  c.close();
});

test('streaming body is still covered by the request deadline', async () => {
  const c = createHttpClient({ policy: loopback(), timeoutMs: 100, retry: false });
  const res = await c.get(`http://127.0.0.1:${plainPort}/slow-body`, { stream: true });
  assert.equal(res.status, 200);
  await assert.rejects(res.text(), { code: ErrorCodes.TIMEOUT });
  c.close();
});

test('streaming: cancel releases the body; error statuses still throw with body', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false });
  const res = await c.get(`http://127.0.0.1:${plainPort}/stream`, { stream: true });
  await res.cancel();
  await assert.rejects(c.get(`http://127.0.0.1:${plainPort}/missing`, { stream: true }), (err) => {
    assert.equal(err.code, HTTP_STATUS);
    assert.equal(err.response.text(), 'not here');
    return true;
  });
  c.close();
});

test('stripHeadersOnRedirect removes extra secrets on cross-origin hops', async () => {
  otherSaw.length = 0;
  const c = createHttpClient({ policy: loopback(), stripHeadersOnRedirect: ['X-Api-Key'] });
  const res = await c.get(`http://127.0.0.1:${plainPort}/to-other?to=http://127.0.0.1:${otherPort}/`, {
    headers: { 'x-api-key': 'secret', authorization: 'Bearer t', 'x-keep': '1' },
  });
  assert.equal(res.text(), 'other');
  assert.equal(otherSaw[0]['x-api-key'], undefined);
  assert.equal(otherSaw[0].authorization, undefined);
  assert.equal(otherSaw[0]['x-keep'], '1');
  c.close();
});

test('HTTP proxy: absolute-form requests with proxy credentials only to the proxy', async () => {
  const seen = [];
  const proxy = http.createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers['proxy-authorization'] });
    const target = new URL(req.url);
    const headers = { ...req.headers };
    delete headers['proxy-authorization'];
    const up = http.request(target, { method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    req.pipe(up);
  });
  const port = await listen(proxy);
  const c = createHttpClient({ policy: loopback(), proxy: `http://user:p%40ss@127.0.0.1:${port}` });
  const res = await c.get(`http://127.0.0.1:${plainPort}/via-proxy`);
  const body = res.json();
  assert.equal(body.path, '/via-proxy');
  assert.equal(body.headers['proxy-authorization'], undefined, 'target must not see proxy credentials');
  assert.equal(seen[0].url, `http://127.0.0.1:${plainPort}/via-proxy`);
  assert.equal(seen[0].auth, `Basic ${Buffer.from('user:p@ss').toString('base64')}`);
  c.close();
  await close(proxy);
});

test('HTTP proxy: guard still checks the target URL', async () => {
  const c = createHttpClient({ proxy: 'http://127.0.0.1:9' });
  await assert.rejects(c.get('http://10.0.0.1/'), { code: DESTINATION_BLOCKED });
  await assert.rejects(c.get('http://169.254.169.254/'), { code: DESTINATION_BLOCKED });
  c.close();
  assert.throws(() => createHttpClient({ proxy: 'socks5://127.0.0.1:1080' }), { code: ErrorCodes.CONFIG });
  assert.throws(() => createHttpClient({ proxy: 'http://p:1', http2: true }), { code: ErrorCodes.CONFIG });
});

test('HTTPS through CONNECT tunnel with custom CA; refused CONNECT is a NetworkError', { skip: !makeCert() && 'openssl not available' }, async () => {
  const target = https.createServer({ key: cert.key, cert: cert.cert }, handler);
  const targetPort = await listen(target);
  const connects = [];
  const sockets = new Set();
  let refuse = false;
  const proxy = http.createServer();
  proxy.on('connect', (req, socket) => {
    connects.push(req.url);
    sockets.add(socket);
    if (refuse) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      return;
    }
    const [host, port] = req.url.split(':');
    const upstream = net.connect(Number(port), host, () => {
      sockets.add(upstream);
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
  });
  const proxyPort = await listen(proxy);

  const c = createHttpClient({ policy: loopback(), proxy: `http://127.0.0.1:${proxyPort}`, ca: cert.cert, retry: false });
  const res = await c.get(`https://127.0.0.1:${targetPort}/tunnelled`);
  assert.equal(res.json().path, '/tunnelled');
  assert.deepEqual(connects, [`127.0.0.1:${targetPort}`]);

  refuse = true;
  await assert.rejects(c.get(`https://127.0.0.1:${targetPort}/again`), (err) => {
    assert.equal(err.code, NETWORK);
    assert.equal(err.details.proxyStatus, 407);
    return true;
  });

  const noCa = createHttpClient({ policy: loopback(), proxy: `http://127.0.0.1:${proxyPort}`, retry: false });
  refuse = false;
  await assert.rejects(noCa.get(`https://127.0.0.1:${targetPort}/`), { code: NETWORK }, 'untrusted cert must fail');
  c.close();
  noCa.close();
  for (const s of sockets) s.destroy();
  await close(proxy);
  await close(target);
});

function h2Handler(stream, headers) {
  const p = headers[':path'];
  if (p === '/big') {
    stream.respond({ ':status': 200 });
    stream.end(Buffer.alloc(4096));
  } else if (p === '/gzip') {
    stream.respond({ ':status': 200, 'content-encoding': 'gzip' });
    stream.end(zlib.gzipSync('h2 zipped'));
  } else if (p === '/redirect') {
    stream.respond({ ':status': 302, location: '/json' });
    stream.end();
  } else {
    stream.respond({ ':status': 200, 'content-type': 'application/json' });
    stream.end(JSON.stringify({ path: p, method: headers[':method'], ua: headers['user-agent'] }));
  }
}

test('HTTP/2 cleartext (h2c): JSON, redirects, gzip, limits and streaming', async () => {
  const server = http2.createServer();
  server.on('stream', h2Handler);
  const port = await listen(server);
  const c = createHttpClient({ policy: loopback(), http2: true, retry: false });
  const base = `http://127.0.0.1:${port}`;
  const res = await c.get(`${base}/json`);
  assert.deepEqual(res.json(), { path: '/json', method: 'GET', ua: 'ametherian-http/0.0.0' });
  const r2 = await c.get(`${base}/redirect`);
  assert.equal(r2.redirected, true);
  assert.equal(r2.json().path, '/json');
  assert.equal((await c.get(`${base}/gzip`)).text(), 'h2 zipped');
  await assert.rejects(c.get(`${base}/big`, { maxResponseBytes: 100 }), { code: ErrorCodes.LIMIT_EXCEEDED });
  const s = await c.get(`${base}/json`, { stream: true });
  assert.equal((await s.json()).path, '/json');
  c.close();
  await new Promise((r) => server.close(r));
});

test('HTTP/2 over TLS with custom CA', { skip: !makeCert() && 'openssl not available' }, async () => {
  const server = http2.createSecureServer({ key: cert.key, cert: cert.cert });
  server.on('stream', h2Handler);
  const port = await listen(server);
  const c = createHttpClient({ policy: loopback(), http2: true, ca: cert.cert, retry: false });
  assert.equal((await c.get(`https://127.0.0.1:${port}/tls`)).json().path, '/tls');
  c.close();
  await new Promise((r) => server.close(r));
});

test('HTTP/2 keeps guard protections (default policy, DNS-time lookup)', async () => {
  const c = createHttpClient({ http2: true, retry: false });
  await assert.rejects(c.get('http://127.0.0.1:1/'), { code: DESTINATION_BLOCKED });
  c.close();
  const resolveToLoopback = (h, o, cb) => queueMicrotask(() => cb(null, [{ address: '127.0.0.1', family: 4 }]));
  const viaDns = createHttpClient({ http2: true, retry: false, policy: createDestinationPolicy({ lookup: resolveToLoopback }) });
  await assert.rejects(viaDns.get('http://svc.test:1/'), { code: DESTINATION_BLOCKED });
  viaDns.close();
});
