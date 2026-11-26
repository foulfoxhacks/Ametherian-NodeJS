import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFetch, TOO_MANY_REDIRECTS } from '../src/index.js';
import { createDestinationPolicy, DESTINATION_BLOCKED } from '@foulfoxhacks/ametherian-guard';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

let server;
let port;
before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/redirect') {
      res.writeHead(302, { location: '/json' });
      return res.end();
    }
    if (u.pathname === '/empty') {
      res.writeHead(204);
      return res.end();
    }
    if (u.pathname === '/slow') return setTimeout(() => res.end('late'), 500);
    if (u.pathname === '/headers') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(req.headers));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(u.pathname === '/missing' ? 404 : 200, { 'content-type': 'application/json', 'x-test': 'yes' });
      res.end(JSON.stringify({ method: req.method, path: u.pathname, body, ct: req.headers['content-type'] ?? null }));
    });
  });
  port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
});
after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }));

const local = () => createFetch({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }) });

test('returns standard Response objects', async () => {
  const fetch = local();
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  assert.ok(res instanceof Response);
  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.equal(res.headers.get('x-test'), 'yes');
  assert.equal(res.url, `http://127.0.0.1:${port}/json`);
  assert.equal(res.redirected, false);
  assert.deepEqual(await res.json(), { method: 'GET', path: '/json', body: '', ct: null });
  fetch.close();
});

test('POST with body and headers; non-2xx resolves like fetch', async () => {
  const fetch = local();
  const res = await fetch(`http://127.0.0.1:${port}/missing`, {
    method: 'post',
    headers: new Headers({ 'content-type': 'text/plain' }),
    body: 'hello',
  });
  assert.equal(res.status, 404);
  assert.equal(res.ok, false);
  assert.deepEqual(await res.json(), { method: 'POST', path: '/missing', body: 'hello', ct: 'text/plain' });
  fetch.close();
});

test('accepts Request objects', async () => {
  const fetch = local();
  const req = new Request(`http://127.0.0.1:${port}/req`, { method: 'PUT', body: 'x', headers: { 'content-type': 'text/plain' } });
  assert.equal((await (await fetch(req)).json()).method, 'PUT');
  fetch.close();
});

test('redirect modes follow, manual and error', async () => {
  const fetch = local();
  const followed = await fetch(`http://127.0.0.1:${port}/redirect`);
  assert.equal(followed.redirected, true);
  assert.equal((await followed.json()).path, '/json');
  const manual = await fetch(`http://127.0.0.1:${port}/redirect`, { redirect: 'manual' });
  assert.equal(manual.status, 302);
  assert.equal(manual.headers.get('location'), '/json');
  await assert.rejects(fetch(`http://127.0.0.1:${port}/redirect`, { redirect: 'error' }), { code: TOO_MANY_REDIRECTS });
  fetch.close();
});

test('null-body statuses and HEAD give a null body', async () => {
  const fetch = local();
  const empty = await fetch(`http://127.0.0.1:${port}/empty`);
  assert.equal(empty.status, 204);
  assert.equal(empty.body, null);
  const head = await fetch(`http://127.0.0.1:${port}/json`, { method: 'HEAD' });
  assert.equal(head.body, null);
  fetch.close();
});

test('keeps Ametherian protections: guard, limits, timeouts, abort, no Blob', async () => {
  const strict = createFetch();
  await assert.rejects(strict(`http://127.0.0.1:${port}/json`), { code: DESTINATION_BLOCKED });
  await assert.rejects(strict('http://169.254.169.254/latest/meta-data/'), { code: DESTINATION_BLOCKED });
  strict.close();
  const small = createFetch({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), maxResponseBytes: 5, timeoutMs: 100 });
  const big = await small(`http://127.0.0.1:${port}/json`);
  await assert.rejects(big.text(), { code: ErrorCodes.LIMIT_EXCEEDED });
  await assert.rejects(small(`http://127.0.0.1:${port}/slow`), { code: ErrorCodes.TIMEOUT });
  await assert.rejects(small(`http://127.0.0.1:${port}/json`, { body: new Blob(['x']), method: 'POST' }), { code: ErrorCodes.CONFIG });
  small.close();
  const fetch = local();
  await assert.rejects(fetch(`http://127.0.0.1:${port}/slow`, { signal: AbortSignal.timeout(20) }), (err) => [ErrorCodes.ABORTED, ErrorCodes.TIMEOUT].includes(err.code));
  fetch.close();
});

const sent = async (fetch, init) => (await fetch(`http://127.0.0.1:${port}/headers`, init)).json();

test('headers: arrays of pairs work like Headers, joining repeats (#25)', async () => {
  const fetch = local();
  const got = await sent(fetch, { headers: [['X-Test', '1'], ['x-test', '2'], ['x-other', 'b']] });
  assert.equal(got['x-test'], '1, 2');
  assert.equal(got['x-other'], 'b');
  const record = await sent(fetch, { headers: { 'X-Mixed': 'a', 'x-mixed': 'b' } });
  assert.equal(record['x-mixed'], 'a, b');
  await assert.rejects(fetch(`http://127.0.0.1:${port}/headers`, { headers: [['only-a-name']] }), { code: ErrorCodes.CONFIG });
  await assert.rejects(fetch(`http://127.0.0.1:${port}/headers`, { headers: [['x-bad', 'a\r\nx-injected: 1']] }), { code: ErrorCodes.CONFIG });
  await assert.rejects(fetch(`http://127.0.0.1:${port}/headers`, { headers: 'x: y' }), { code: ErrorCodes.CONFIG });
  fetch.close();
});

test('cache modes send the same cache headers as Node fetch (undici)', async () => {
  const fetch = local();
  const cases = [
    {}, { cache: 'default' }, { cache: 'no-cache' }, { cache: 'no-store' }, { cache: 'reload' }, { cache: 'force-cache' },
    { headers: { 'if-none-match': '"abc"' } },
    { headers: { 'if-modified-since': 'Tue, 24 Nov 2026 00:00:00 GMT' }, cache: 'no-cache' },
    { cache: 'no-store', headers: { 'cache-control': 'max-age=5' } },
    { cache: 'no-cache', headers: { 'Cache-Control': 'no-transform' } },
  ];
  for (const init of cases) {
    const ours = await sent(fetch, init);
    const native = await (await globalThis.fetch(`http://127.0.0.1:${port}/headers`, init)).json();
    const pick = (h) => ({ pragma: h.pragma, 'cache-control': h['cache-control'] });
    assert.deepEqual(pick(ours), pick(native), JSON.stringify(init));
  }
  fetch.close();
});

test('options it cannot honour throw instead of being ignored', async () => {
  const fetch = local();
  const url = `http://127.0.0.1:${port}/headers`;
  for (const init of [
    { cache: 'only-if-cached' }, { cache: 'sometimes' }, { integrity: 'sha256-abc' }, { dispatcher: {} },
    { referrer: 'https://example.com/' }, { mode: 'same-origin' }, { cf: { cacheTtl: 5 } }, { next: { revalidate: 60 } },
    { credentials: 'always' }, { duplex: 'full' }, { window: {} },
  ]) {
    await assert.rejects(fetch(url, init), (err) => err.code === ErrorCodes.CONFIG && err.details?.problems?.length === 1, JSON.stringify(init));
  }
  // Values fetch() itself treats as no-ops on a server are accepted.
  const ok = await fetch(url, {
    credentials: 'include', mode: 'cors', keepalive: true, referrer: '', referrerPolicy: 'no-referrer',
    integrity: '', priority: 'high', duplex: 'half', window: null, cache: undefined,
  });
  assert.equal(ok.status, 200);
  fetch.close();
});

test('a Request keeps its own options: redirect, cache and integrity', async () => {
  const fetch = local();
  const manual = await fetch(new Request(`http://127.0.0.1:${port}/redirect`, { redirect: 'manual' }));
  assert.equal(manual.status, 302);
  const overridden = await fetch(new Request(`http://127.0.0.1:${port}/redirect`, { redirect: 'manual' }), { redirect: 'follow' });
  assert.equal(overridden.status, 200);
  const noCache = await (await fetch(new Request(`http://127.0.0.1:${port}/headers`, { cache: 'no-cache' }))).json();
  assert.equal(noCache['cache-control'], 'max-age=0');
  await assert.rejects(fetch(new Request(`http://127.0.0.1:${port}/headers`, { integrity: 'sha256-abc' })), { code: ErrorCodes.CONFIG });
  fetch.close();
});
