// The edge entry (fetch()-based transport) exercised with a real fetch against local servers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createHttpClient, createFetch, createFetchTransport, TOO_MANY_REDIRECTS } from '../src/edge.js';
import { createDestinationPolicy, DESTINATION_BLOCKED } from '@foulfoxhacks/ametherian-guard';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

let a; let b; let A; let B;
const seenB = [];
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
before(async () => {
  a = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/json') { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true,"__proto__":{"p":1}}'); }
    if (u.pathname === '/bomb') { res.setHeader('content-encoding', 'gzip'); return res.end(zlib.gzipSync(Buffer.alloc(5_000_000))); }
    if (u.pathname === '/redirect') { res.writeHead(302, { location: u.searchParams.get('to') }); return res.end(); }
    if (u.pathname === '/slow') return setTimeout(() => res.end('late'), 400);
    if (u.pathname === '/stream') { res.write('a'.repeat(5)); return setTimeout(() => res.end('b'.repeat(5)), 10); }
    res.end(`echo ${req.method} ${req.headers['x-test'] ?? ''}`);
  });
  A = await listen(a);
  b = http.createServer((req, res) => { seenB.push(req.headers); res.end('b'); });
  B = await listen(b);
});
after(async () => {
  for (const s of [a, b]) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
});

const local = (extra = {}) => createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }), retry: false, ...extra });

test('edge client: JSON with pollution keys dropped, headers sent', async () => {
  const c = local({ headers: { 'x-test': 'yes' } });
  const res = await c.get(`http://127.0.0.1:${A}/json`);
  assert.deepEqual(Object.keys(res.json()), ['ok']);
  assert.equal((await c.get(`http://127.0.0.1:${A}/`)).text(), 'echo GET yes');
});

test('edge client: guard blocks private destinations by default', async () => {
  const c = createHttpClient({ retry: false });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/json`), { code: DESTINATION_BLOCKED });
  await assert.rejects(c.get('http://169.254.169.254/latest/meta-data/'), { code: DESTINATION_BLOCKED });
});

test('edge client: size limit applies after decompression (gzip bomb)', async () => {
  const c = local({ maxResponseBytes: 10_000 });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/bomb`), { code: ErrorCodes.LIMIT_EXCEEDED });
  const s = await c.get(`http://127.0.0.1:${A}/bomb`, { stream: true });
  await assert.rejects(s.bytes(), { code: ErrorCodes.LIMIT_EXCEEDED });
});

test('edge client: redirects are re-checked by the guard and strip credentials cross-origin', async () => {
  seenB.length = 0;
  const c = local();
  const res = await c.get(`http://127.0.0.1:${A}/redirect?to=http://127.0.0.1:${B}/`, { headers: { authorization: 'Bearer secret' } });
  assert.equal(res.text(), 'b');
  assert.equal(res.redirected, true);
  assert.equal(seenB[0].authorization, undefined);
  await assert.rejects(c.get(`http://127.0.0.1:${A}/redirect?to=http://10.0.0.1/`), { code: DESTINATION_BLOCKED });
  const zero = local({ maxRedirects: 0 });
  await assert.rejects(zero.get(`http://127.0.0.1:${A}/redirect?to=http://127.0.0.1:${B}/`), { code: TOO_MANY_REDIRECTS });
});

test('edge client: timeouts, abort and streaming', async () => {
  const c = local({ timeoutMs: 50 });
  await assert.rejects(c.get(`http://127.0.0.1:${A}/slow`), { code: ErrorCodes.TIMEOUT });
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(local().get(`http://127.0.0.1:${A}/slow`, { signal: ctl.signal }), (e) => [ErrorCodes.ABORTED, ErrorCodes.TIMEOUT].includes(e.code));
  const s = await local().get(`http://127.0.0.1:${A}/stream`, { stream: true });
  assert.equal(await s.text(), 'aaaaabbbbb');
});

test('edge createFetch returns standard Responses', async () => {
  const fetch = createFetch({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }) });
  const res = await fetch(`http://127.0.0.1:${A}/json`);
  assert.ok(res instanceof Response);
  assert.equal(res.status, 200);
  // Standard Response.json() is the platform parser: "__proto__" stays an own key and pollutes nothing.
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal({}.p, undefined);
});

test('edge client refuses Node-only options instead of ignoring them', () => {
  for (const extra of [{ proxy: 'http://p:8080' }, { http2: true }, { ca: 'pem' }]) {
    assert.throws(() => createHttpClient(extra), { code: ErrorCodes.CONFIG }, JSON.stringify(extra));
  }
});

test('fetch transport accepts an injected fetch (e.g. a Workers service binding)', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push([url, init.redirect]);
    return new Response('hi', { status: 200, headers: { 'x-a': '1' } });
  };
  const c = createHttpClient({ transport: createFetchTransport({ fetch: fakeFetch }), retry: false });
  const res = await c.get('https://example.com/x');
  assert.equal(res.text(), 'hi');
  assert.equal(res.headers.get('x-a'), '1');
  assert.deepEqual(calls, [['https://example.com/x', 'manual']]);
});
