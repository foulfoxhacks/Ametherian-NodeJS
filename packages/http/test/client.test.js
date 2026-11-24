import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createHttpClient, HTTP_STATUS, NETWORK, TOO_MANY_REDIRECTS, parseRetryAfter } from '../src/index.js';
import { createDestinationPolicy, DESTINATION_BLOCKED } from '@foulfoxhacks/ametherian-guard';
import { createEventHub, ErrorCodes } from '@foulfoxhacks/ametherian-core';
import { object, string } from '@foulfoxhacks/ametherian-schema';

// Two servers on different ports = two origins, for cross-origin redirect tests.
let a;
let b;
let A;
let B;
const counters = { flaky: 0, slow: 0 };
const seenAuth = [];

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

before(async () => {
  a = await listen((req, res) => {
    const url = new URL(req.url, 'http://x');
    switch (url.pathname) {
      case '/json':
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ name: 'ametherian' }));
      case '/echo': {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() }));
        });
        return;
      }
      case '/status':
        res.statusCode = Number(url.searchParams.get('code'));
        return res.end('status');
      case '/flaky':
        counters.flaky++;
        if (counters.flaky < 3) {
          res.statusCode = 503;
          res.setHeader('retry-after', '0');
          return res.end();
        }
        return res.end('recovered');
      case '/slow':
        counters.slow++;
        return setTimeout(() => res.end('late'), 300);
      case '/big':
        return res.end(Buffer.alloc(2048));
      case '/gzip-bomb': {
        res.setHeader('content-encoding', 'gzip');
        return res.end(zlib.gzipSync(Buffer.alloc(5_000_000)));
      }
      case '/gzip':
        res.setHeader('content-encoding', 'gzip');
        return res.end(zlib.gzipSync('compressed hello'));
      case '/redirect-same':
        res.statusCode = 302;
        res.setHeader('location', '/json');
        return res.end();
      case '/redirect-cross':
        res.statusCode = 307;
        res.setHeader('location', `http://127.0.0.1:${B}/auth`);
        return res.end();
      case '/redirect-post':
        res.statusCode = 303;
        res.setHeader('location', '/echo');
        return res.end();
      case '/loop':
        res.statusCode = 302;
        res.setHeader('location', '/loop');
        return res.end();
      case '/redirect-metadata':
        res.statusCode = 302;
        res.setHeader('location', 'http://169.254.169.254/latest/meta-data/');
        return res.end();
      case '/redirect-file':
        res.statusCode = 302;
        res.setHeader('location', 'file:///etc/passwd');
        return res.end();
      default:
        res.statusCode = 404;
        return res.end();
    }
  });
  A = a.address().port;
  b = await listen((req, res) => {
    seenAuth.push(req.headers.authorization ?? null);
    res.end('b');
  });
  B = b.address().port;
});

after(async () => {
  await new Promise((r) => a.close(r));
  await new Promise((r) => b.close(r));
});

// Tests talk to 127.0.0.1, so loopback must be allowed explicitly.
const loopback = () => createDestinationPolicy({ allowCategories: ['loopback'] });
const client = (extra = {}) => createHttpClient({ policy: loopback(), retry: { minDelayMs: 0, maxDelayMs: 0 }, ...extra });

test('default policy blocks loopback (secure default)', async () => {
  const c = createHttpClient();
  await assert.rejects(c.get(`http://127.0.0.1:${A}/json`), { code: DESTINATION_BLOCKED });
  await assert.rejects(c.get('http://169.254.169.254/'), { code: DESTINATION_BLOCKED });
  c.close();
});

test('GET JSON with schema validation', async () => {
  const c = client();
  const res = await c.get(`http://127.0.0.1:${A}/json`);
  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.deepEqual(res.json({ schema: object({ name: string() }) }), { name: 'ametherian' });
  c.close();
});

test('baseUrl, json body and default headers', async () => {
  const c = client({ baseUrl: `http://127.0.0.1:${A}`, headers: { 'X-App': 'test' } });
  const res = await c.post('/echo', { json: { a: 1 } });
  const echo = res.json();
  assert.equal(echo.method, 'POST');
  assert.equal(echo.body, '{"a":1}');
  assert.equal(echo.headers['content-type'], 'application/json');
  assert.equal(echo.headers['x-app'], 'test');
  assert.equal(echo.headers['content-length'], '7');
  assert.match(echo.headers['user-agent'], /^ametherian-http/);
  c.close();
});

test('non-2xx throws HttpStatusError unless disabled', async () => {
  const c = client({ retry: false });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/status?code=404`), (err) => {
    assert.equal(err.code, HTTP_STATUS);
    assert.equal(err.details.status, 404);
    assert.equal(err.retryable, false);
    assert.equal(err.response.text(), 'status');
    return true;
  });
  const res = await c.get(`http://127.0.0.1:${A}/status?code=500`, { throwOnStatus: false });
  assert.equal(res.status, 500);
  c.close();
});

test('retries idempotent requests on 503 and honours Retry-After', async () => {
  counters.flaky = 0;
  const hub = createEventHub();
  const retries = [];
  hub.on('http.retry', (e) => retries.push(e.attempt));
  const c = client({ hooks: hub });
  const res = await c.get(`http://127.0.0.1:${A}/flaky`);
  assert.equal(res.text(), 'recovered');
  assert.deepEqual(retries, [1, 2]);
  c.close();
});

test('does not retry non-idempotent methods', async () => {
  counters.flaky = 0;
  const c = client();
  await assert.rejects(c.post(`http://127.0.0.1:${A}/flaky`, { body: 'x' }), { code: HTTP_STATUS });
  assert.equal(counters.flaky, 1);
  c.close();
});

test('per-attempt timeout produces TimeoutError and is retried', async () => {
  counters.slow = 0;
  const c = client({ timeoutMs: 50, retry: { retries: 1, minDelayMs: 0, maxDelayMs: 0 } });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/slow`), { code: ErrorCodes.TIMEOUT });
  assert.equal(counters.slow, 2);
  c.close();
});

test('caller abort stops the request', async () => {
  const c = client();
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(c.get(`http://127.0.0.1:${A}/slow`, { signal: ctl.signal }), { code: ErrorCodes.ABORTED });
  c.close();
});

test('response size limit, including after decompression', async () => {
  const c = client({ maxResponseBytes: 1024 });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/big`), { code: ErrorCodes.LIMIT_EXCEEDED });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/gzip-bomb`), (err) => {
    assert.equal(err.code, ErrorCodes.LIMIT_EXCEEDED);
    assert.equal(err.details.resource, 'response-body');
    return true;
  });
  const ok = await c.get(`http://127.0.0.1:${A}/gzip`);
  assert.equal(ok.text(), 'compressed hello');
  assert.equal(ok.headers.get('content-encoding'), null);
  c.close();
});

test('follows same-origin redirects', async () => {
  const c = client();
  const res = await c.get(`http://127.0.0.1:${A}/redirect-same`);
  assert.equal(res.redirected, true);
  assert.equal(res.url, `http://127.0.0.1:${A}/json`);
  c.close();
});

test('strips credentials on cross-origin redirect', async () => {
  seenAuth.length = 0;
  const c = client();
  const res = await c.get(`http://127.0.0.1:${A}/redirect-cross`, { headers: { Authorization: 'Bearer secret' } });
  assert.equal(res.text(), 'b');
  assert.deepEqual(seenAuth, [null]);
  c.close();
});

test('303 turns POST into GET without body', async () => {
  const c = client();
  const res = await c.post(`http://127.0.0.1:${A}/redirect-post`, { json: { x: 1 } });
  const echo = res.json();
  assert.equal(echo.method, 'GET');
  assert.equal(echo.body, '');
  assert.equal(echo.headers['content-type'], undefined);
  c.close();
});

test('redirect limits and policy re-checks', async () => {
  const c = client({ maxRedirects: 3 });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/loop`), { code: TOO_MANY_REDIRECTS });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/redirect-metadata`), { code: DESTINATION_BLOCKED });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/redirect-file`), { code: DESTINATION_BLOCKED });
  c.close();
});

test('connection failures are retryable NetworkErrors', async () => {
  const closed = await listen(() => {});
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  const c = client({ retry: false });
  await assert.rejects(c.get(`http://127.0.0.1:${port}/`), (err) => {
    assert.equal(err.code, NETWORK);
    assert.equal(err.retryable, true);
    assert.equal(err.details.syscallCode, 'ECONNREFUSED');
    return true;
  });
  c.close();
});

test('rejects header injection and bad options', async () => {
  const c = client();
  await assert.rejects(c.get(`http://127.0.0.1:${A}/json`, { headers: { 'x-a': 'v\r\nInjected: 1' } }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.request({ url: `http://127.0.0.1:${A}/`, method: 'get' }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.post(`http://127.0.0.1:${A}/echo`, { body: 'x', json: {} }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.post(`http://127.0.0.1:${A}/echo`, { body: { a: 1 } }), { code: ErrorCodes.CONFIG });
  assert.throws(() => createHttpClient({ retry: 3 }), { code: ErrorCodes.CONFIG });
  assert.throws(() => createHttpClient({ policy: {} }), { code: ErrorCodes.CONFIG });
  c.close();
});

test('events carry redacted URLs', async () => {
  const hub = createEventHub();
  const urls = [];
  hub.on('http.request', (e) => urls.push(e.url));
  const c = client({ hooks: hub });
  await c.get(`http://127.0.0.1:${A}/json?token=secret`);
  assert.deepEqual(urls, [`http://127.0.0.1:${A}/json?token=%5BREDACTED%5D`]);
  c.close();
});

test('parseRetryAfter handles seconds and dates', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), () => 4000), 6000);
  assert.equal(parseRetryAfter('soon'), undefined);
  assert.equal(parseRetryAfter(null), undefined);
});
