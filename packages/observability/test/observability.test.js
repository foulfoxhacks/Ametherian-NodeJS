import { test } from 'node:test';
import assert from 'node:assert/strict';
import diagnostics from 'node:diagnostics_channel';
import {
  createLogger,
  sanitize,
  serializeError,
  createMetrics,
  OVERFLOW_LABEL,
  attachEventHub,
  publishToDiagnosticsChannel,
} from '../src/index.js';
import { createEventHub, TimeoutError, REDACTED, ErrorCodes } from '@foulfoxhacks/ametherian-core';

const fixedNow = () => new Date('2026-01-01T00:00:00Z');

test('logger writes structured records at or above level', () => {
  const out = [];
  const log = createLogger({ level: 'info', sink: (r) => out.push(r), now: fixedNow, fields: { svc: 'api' } });
  log.debug('hidden');
  log.info('hello', { n: 1 });
  log.error('bad');
  assert.deepEqual(out, [
    { time: '2026-01-01T00:00:00.000Z', level: 'info', msg: 'hello', svc: 'api', n: 1 },
    { time: '2026-01-01T00:00:00.000Z', level: 'error', msg: 'bad', svc: 'api' },
  ]);
  assert.equal(log.isEnabled('debug'), false);
});

test('logger redacts secrets, headers and URLs by default', () => {
  const out = [];
  const log = createLogger({ sink: (r) => out.push(r), now: fixedNow, redactKeys: ['ssn'] });
  log.info('req', {
    password: 'p',
    apiKey: 'k',
    nested: { refresh_token: 't', ok: 1 },
    headers: { Authorization: 'Bearer x', accept: '*/*' },
    url: 'https://u:pw@example.com/?token=abc&q=1',
    ssn: '123',
  });
  const r = out[0];
  assert.equal(r.password, REDACTED);
  assert.equal(r.apiKey, REDACTED);
  assert.equal(r.nested.refresh_token, REDACTED);
  assert.equal(r.nested.ok, 1);
  assert.equal(r.headers.Authorization, REDACTED);
  assert.equal(r.headers.accept, '*/*');
  assert.equal(r.url, 'https://example.com/?token=%5BREDACTED%5D&q=1');
  assert.equal(r.ssn, REDACTED);
  assert.ok(!JSON.stringify(r).includes('Bearer x'));
});

test('child loggers add fields; sink errors are swallowed', () => {
  const out = [];
  const child = createLogger({ sink: (r) => out.push(r), now: fixedNow, fields: { a: 1 } }).child({ b: 2 });
  child.info('x');
  assert.equal(out[0].a, 1);
  assert.equal(out[0].b, 2);
  child.info('scalar', 'text');
  assert.equal(out[1].data, 'text');
  createLogger({
    sink: () => {
      throw new Error('disk full');
    },
  }).info('still fine');
  assert.throws(() => createLogger({ level: 'loud' }), { code: ErrorCodes.CONFIG });
});

test('sanitize bounds cycles, depth, long strings and binary data', () => {
  const a = { name: 'a' };
  a.self = a;
  assert.equal(sanitize(a).self, '[circular]');
  let deep = {};
  const root = deep;
  for (let i = 0; i < 10; i++) deep = deep.next = {};
  assert.match(JSON.stringify(sanitize(root)), /\[max depth\]/);
  assert.match(sanitize('x'.repeat(10_000)), /\[truncated\]$/);
  assert.equal(sanitize(new Uint8Array(3)), '[Uint8Array 3 bytes]');
  assert.equal(sanitize(10n), '10');
  assert.equal(sanitize(() => 1), '[function]');
});

test('errors are serialised with codes and causes, stack only when asked', () => {
  const err = new TimeoutError('slow', { cause: Object.assign(new Error('socket'), { code: 'ECONNRESET' }) });
  const s = serializeError(err);
  assert.equal(s.code, ErrorCodes.TIMEOUT);
  assert.deepEqual(s.cause, { name: 'Error', message: 'socket', code: 'ECONNRESET' });
  assert.equal('stack' in s, false);
  assert.ok(serializeError(new Error('x'), true).stack);
  assert.deepEqual(serializeError('str'), { message: 'str' });
});

test('counters, gauges and histograms', () => {
  const m = createMetrics();
  const c = m.counter('requests_total', 'Requests');
  c.inc({ method: 'GET' });
  c.inc({ method: 'GET' }, 2);
  m.gauge('in_flight').set({}, 3);
  const h = m.histogram('latency_ms', 'Latency', [10, 100]);
  h.observe({}, 5);
  h.observe({}, 50);
  h.observe({}, 500);
  const snap = m.snapshot();
  assert.equal(snap.requests_total.series[0].value, 3);
  assert.equal(snap.in_flight.series[0].value, 3);
  assert.deepEqual(snap.latency_ms.series[0], { labels: {}, counts: [1, 2], sum: 555, count: 3 });
  assert.throws(() => c.inc({}, -1), RangeError);
  assert.throws(() => m.gauge('requests_total'), TypeError);
  assert.throws(() => m.counter('bad name'), TypeError);
});

test('label cardinality is bounded', () => {
  const m = createMetrics({ maxSeries: 2 });
  const c = m.counter('hits');
  for (let i = 0; i < 100; i++) c.inc({ user: String(i) });
  const series = m.snapshot().hits.series;
  assert.equal(series.length, 3);
  assert.equal(series[2].labels[OVERFLOW_LABEL], 'true');
  assert.equal(series[2].value, 98);
});

test('prometheus output escapes label values', () => {
  const m = createMetrics();
  m.counter('x_total', 'help').inc({ path: 'a"b\\c\nd' });
  m.histogram('h', '', [1]).observe({}, 2);
  const text = m.toPrometheus();
  assert.match(text, /x_total\{path="a\\"b\\\\c\\nd"\} 1/);
  assert.match(text, /h_bucket\{le="1"\} 0/);
  assert.match(text, /h_bucket\{le="\+Inf"\} 1/);
});

test('event hub bridge logs and counts events', () => {
  const hub = createEventHub();
  const out = [];
  const metrics = createMetrics();
  const detach = attachEventHub(hub, { logger: createLogger({ level: 'debug', sink: (r) => out.push(r), now: fixedNow }), metrics });
  hub.emit('http.request', { url: 'https://example.com/?key=s' });
  hub.emit('http.error', { error: new Error('boom') });
  detach();
  hub.emit('ignored', {});
  assert.deepEqual(out.map((r) => [r.level, r.msg]), [['debug', 'http.request'], ['warn', 'http.error']]);
  assert.equal(out[0].url, 'https://example.com/?key=%5BREDACTED%5D');
  assert.equal(metrics.snapshot().ametherian_events_total.series.length, 2);
});

test('diagnostics_channel bridge publishes to subscribers', () => {
  const hub = createEventHub();
  const got = [];
  const fn = (msg) => got.push(msg);
  diagnostics.subscribe('test:thing', fn);
  const detach = publishToDiagnosticsChannel(hub, 'test:');
  hub.emit('thing', { a: 1 });
  hub.emit('other', { a: 2 });
  detach();
  diagnostics.unsubscribe('test:thing', fn);
  assert.deepEqual(got, [{ a: 1 }]);
});
