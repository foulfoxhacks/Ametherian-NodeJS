import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import http2 from 'node:http2';
import { Readable } from 'node:stream';
import { createHttpClient, createFetch, createFetchTransport, STREAM_BODY_REDIRECT } from '../src/index.js';
import { createHttpClient as createEdgeClient } from '../src/edge.js';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

const loopback = () => createDestinationPolicy({ allowCategories: ['loopback'] });
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const close = (server) => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });
const enc = new TextEncoder();

let server;
let base;
const hits = { flaky: 0, upload: 0 };

before(async () => {
  server = http.createServer(async (req, res) => {
    const chunks = [];
    try {
      for await (const c of req) chunks.push(c);
    } catch {
      return; // client aborted mid-upload
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, 'http://x');
    const echo = () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        method: req.method,
        body,
        length: req.headers['content-length'] ?? null,
        chunked: req.headers['transfer-encoding'] === 'chunked',
      }));
    };
    switch (url.pathname) {
      case '/echo':
        hits.upload++;
        return echo();
      case '/flaky':
        hits.flaky++;
        res.statusCode = 503;
        return res.end('busy');
      case '/307':
        res.writeHead(307, { location: '/echo' });
        return res.end();
      case '/303':
        res.writeHead(303, { location: '/echo' });
        return res.end();
      default:
        res.statusCode = 404;
        return res.end();
    }
  });
  base = `http://127.0.0.1:${await listen(server)}`;
});
after(() => close(server));

function webStream(parts, onCancel) {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < parts.length) controller.enqueue(typeof parts[i] === 'string' ? enc.encode(parts[i++]) : parts[i++]);
      else controller.close();
    },
    cancel: onCancel,
  });
}

test('a web ReadableStream body is sent chunked and arrives intact', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false });
  const res = await c.post(`${base}/echo`, { body: webStream(['hello ', 'stream', 'ing 🦊']) });
  assert.deepEqual(res.json(), { method: 'POST', body: 'hello streaming 🦊', length: null, chunked: true });
  c.close();
});

test('async iterables and Node Readable streams work as bodies; chunk types are normalised', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false });
  async function* gen() {
    yield 'a';
    yield enc.encode('b');
    yield new Uint16Array([0x6463]).buffer; // ArrayBuffer: bytes 'c','d'
    yield new DataView(enc.encode('e').buffer);
  }
  assert.equal((await c.put(`${base}/echo`, { body: gen() })).json().body, 'abcde');
  assert.equal((await c.put(`${base}/echo`, { body: Readable.from(['x', 'y', 'z']) })).json().body, 'xyz');
  async function* bad() { yield 42; }
  await assert.rejects(c.put(`${base}/echo`, { body: bad() }), { code: ErrorCodes.CONFIG });
  c.close();
});

test('contentLength is sent and enforced exactly', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false });
  const res = await c.post(`${base}/echo`, { body: webStream(['12', '345']), contentLength: 5 });
  assert.deepEqual(res.json(), { method: 'POST', body: '12345', length: '5', chunked: false });
  await assert.rejects(c.post(`${base}/echo`, { body: webStream(['12']), contentLength: 5 }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.post(`${base}/echo`, { body: webStream(['123456']), contentLength: 5 }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.post(`${base}/echo`, { body: 'buffered', contentLength: 8 }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.post(`${base}/echo`, { body: webStream(['x']), contentLength: 11, maxRequestBytes: 10 }), { code: ErrorCodes.LIMIT_EXCEEDED });
  c.close();
});

test('maxRequestBytes stops a stream mid-upload and cancels the source', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false, maxRequestBytes: 10 });
  let cancelled = false;
  let produced = 0;
  const endless = new ReadableStream({
    pull(controller) {
      produced++;
      controller.enqueue(enc.encode('0123456'));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(c.post(`${base}/echo`, { body: endless }), (err) => {
    assert.equal(err.code, ErrorCodes.LIMIT_EXCEEDED);
    assert.equal(err.details.resource, 'request-body');
    assert.equal(err.details.limit, 10);
    return true;
  });
  assert.equal(cancelled, true);
  assert.ok(produced <= 3, `read only past the limit, not the whole source (${produced} chunks)`);

  let finalized = false;
  async function* gen() {
    try { for (;;) yield 'abcdef'; } finally { finalized = true; }
  }
  await assert.rejects(c.post(`${base}/echo`, { body: gen() }), { code: ErrorCodes.LIMIT_EXCEEDED });
  assert.equal(finalized, true, 'async iterator is returned');
  c.close();
});

test('a streamed body is never retried, even for idempotent methods', async () => {
  const c = createHttpClient({ policy: loopback(), retry: { retries: 3, minDelayMs: 1, maxDelayMs: 1 } });
  hits.flaky = 0;
  await assert.rejects(c.put(`${base}/flaky`, { body: webStream(['once']) }), { code: 'AMETHERIAN_HTTP_STATUS' });
  assert.equal(hits.flaky, 1);
  // A buffered body still retries.
  hits.flaky = 0;
  await assert.rejects(c.put(`${base}/flaky`, { body: 'again' }), { code: 'AMETHERIAN_HTTP_STATUS' });
  assert.equal(hits.flaky, 4);
  c.close();
});

test('307/308 cannot resend a stream; 303 follows as GET without the body', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false });
  hits.upload = 0;
  await assert.rejects(c.post(`${base}/307`, { body: webStream(['data']) }), { code: STREAM_BODY_REDIRECT });
  assert.equal(hits.upload, 0, 'nothing was sent to the redirect target');
  const res = await c.post(`${base}/303`, { body: webStream(['data']) });
  assert.deepEqual(res.json(), { method: 'GET', body: '', length: null, chunked: false });
  // redirect: 'manual' returns the 307 itself.
  const manual = await c.post(`${base}/307`, { body: webStream(['data']), redirect: 'manual', throwOnStatus: false });
  assert.equal(manual.status, 307);
  c.close();
});

test('stream bodies are single-use, exclusive with json, and abort cancels the source', async () => {
  const c = createHttpClient({ policy: loopback(), retry: false });
  const s = webStream(['x']);
  s.getReader(); // lock it
  await assert.rejects(c.post(`${base}/echo`, { body: s }), { code: ErrorCodes.CONFIG });
  await assert.rejects(c.post(`${base}/echo`, { body: webStream(['x']), json: { a: 1 } }), { code: ErrorCodes.CONFIG });

  let cancelled = false;
  const controller = new AbortController();
  const slow = new ReadableStream({
    async pull(ctrl) {
      await new Promise((r) => setTimeout(r, 20));
      ctrl.enqueue(enc.encode('.'));
    },
    cancel() { cancelled = true; },
  });
  setTimeout(() => controller.abort(new Error('stop')), 60);
  await assert.rejects(c.post(`${base}/echo`, { body: slow, signal: controller.signal }), { code: ErrorCodes.ABORTED });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(cancelled, true);
  c.close();
});

test('HTTP/2 sends streamed bodies as DATA frames with the same limits', async () => {
  const h2 = http2.createServer();
  h2.on('stream', async (stream, headers) => {
    const chunks = [];
    try { for await (const c of stream) chunks.push(c); } catch { return; }
    stream.respond({ ':status': 200, 'content-type': 'application/json' });
    stream.end(JSON.stringify({ body: Buffer.concat(chunks).toString(), length: headers['content-length'] ?? null }));
  });
  const port = await listen(h2);
  const c = createHttpClient({ policy: loopback(), http2: true, retry: false, maxRequestBytes: 64 });
  const url = `http://127.0.0.1:${port}/up`;
  assert.deepEqual((await c.post(url, { body: webStream(['h2 ', 'body']) })).json(), { body: 'h2 body', length: null });
  assert.deepEqual((await c.post(url, { body: webStream(['abc']), contentLength: 3 })).json(), { body: 'abc', length: '3' });
  async function* big() { for (;;) yield 'x'.repeat(40); }
  await assert.rejects(c.post(url, { body: big() }), { code: ErrorCodes.LIMIT_EXCEEDED });
  c.close();
  await close(h2);
});

test('the fetch transport streams with duplex: half and keeps limit errors typed', async () => {
  const seen = [];
  const recording = (url, init) => {
    seen.push(init.duplex);
    return globalThis.fetch(url, init);
  };
  const c = createHttpClient({ policy: loopback(), transport: createFetchTransport({ fetch: recording }), retry: false, maxRequestBytes: 16 });
  assert.equal((await c.post(`${base}/echo`, { body: webStream(['via ', 'fetch']) })).json().body, 'via fetch');
  assert.equal(seen[0], 'half');
  await assert.rejects(c.post(`${base}/echo`, { body: webStream(['0123456789', '0123456789']) }), { code: ErrorCodes.LIMIT_EXCEEDED });
  assert.equal((await c.post(`${base}/echo`, { body: 'bytes' })).json().body, 'bytes');
  assert.equal(seen[2], undefined, 'buffered bodies do not set duplex');

  const edge = createEdgeClient({ policy: loopback(), retry: false });
  assert.equal((await edge.post(`${base}/echo`, { body: webStream(['edge']) })).json().body, 'edge');
});

test('createFetch() takes a ReadableStream body with duplex: half, as fetch() does', async () => {
  const fetch = createFetch({ policy: loopback(), maxRequestBytes: 16 });
  const res = await fetch(`${base}/echo`, { method: 'POST', body: webStream(['drop', '-in']), duplex: 'half' });
  assert.equal((await res.json()).body, 'drop-in');
  await assert.rejects(fetch(`${base}/echo`, { method: 'POST', body: webStream(['x']) }), { code: ErrorCodes.CONFIG });
  await assert.rejects(fetch(`${base}/echo`, { method: 'POST', body: webStream(['0123456789', '0123456789']), duplex: 'half' }), { code: ErrorCodes.LIMIT_EXCEEDED });
  fetch.close();
});
