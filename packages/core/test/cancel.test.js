import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createDeadline, throwIfAborted, abortable, toAbortError } from '../src/cancel.js';
import { ErrorCodes, AbortError } from '../src/errors.js';

test('toAbortError maps reasons to typed errors', () => {
  assert.equal(toAbortError(undefined).code, ErrorCodes.ABORTED);
  const root = new Error('user');
  const wrapped = toAbortError(root);
  assert.equal(wrapped.code, ErrorCodes.ABORTED);
  assert.equal(wrapped.cause, root);
  assert.equal(toAbortError(new DOMException('t', 'TimeoutError')).code, ErrorCodes.TIMEOUT);
  const own = new AbortError('mine');
  assert.equal(toAbortError(own), own);
});

test('throwIfAborted is a no-op for missing or live signals', () => {
  throwIfAborted(undefined);
  throwIfAborted(new AbortController().signal);
});

test('throwIfAborted throws typed error for aborted signal', () => {
  const c = new AbortController();
  c.abort();
  assert.throws(() => throwIfAborted(c.signal), { code: ErrorCodes.ABORTED });
  assert.throws(() => throwIfAborted(AbortSignal.abort(new DOMException('x', 'TimeoutError'))), {
    code: ErrorCodes.TIMEOUT,
  });
});

test('createDeadline rejects invalid durations', () => {
  for (const bad of [-1, NaN, Infinity, '10', undefined]) {
    assert.throws(() => createDeadline(bad), { code: ErrorCodes.CONFIG });
  }
});

test('deadline fires TimeoutError', async () => {
  const d = createDeadline(10);
  assert.equal(d.signal.aborted, false);
  await sleep(40);
  assert.equal(d.signal.aborted, true);
  assert.equal(d.signal.reason.code, ErrorCodes.TIMEOUT);
  assert.equal(d.signal.reason.details.timeoutMs, 10);
  assert.ok(d.expiresAt <= Date.now());
});

test('dispose stops the deadline from firing', async () => {
  const d = createDeadline(10);
  d.dispose();
  await sleep(30);
  assert.equal(d.signal.aborted, false);
});

test('parent abort propagates as AbortError', () => {
  const parent = new AbortController();
  const d = createDeadline(10_000, { signal: parent.signal });
  const reason = new Error('stop');
  parent.abort(reason);
  assert.equal(d.signal.reason.code, ErrorCodes.ABORTED);
  assert.equal(d.signal.reason.cause, reason);
  d.dispose();
});

test('already-aborted parent aborts immediately', () => {
  const d = createDeadline(10_000, { signal: AbortSignal.abort() });
  assert.equal(d.signal.aborted, true);
  assert.equal(d.signal.reason.code, ErrorCodes.ABORTED);
});

test('dispose detaches from parent', () => {
  const parent = new AbortController();
  const d = createDeadline(10_000, { signal: parent.signal });
  d.dispose();
  parent.abort();
  assert.equal(d.signal.aborted, false);
});

test('abortable resolves when work wins', async () => {
  const c = new AbortController();
  assert.equal(await abortable(Promise.resolve(5), c.signal), 5);
  assert.equal(await abortable(async () => 6, c.signal), 6);
  assert.equal(await abortable(Promise.resolve(7), undefined), 7);
});

test('abortable passes through work rejection', async () => {
  await assert.rejects(abortable(Promise.reject(new Error('x')), new AbortController().signal), /x/);
});

test('abortable rejects when signal wins', async () => {
  const c = new AbortController();
  const p = abortable(sleep(1_000, 'late', { ref: false }), c.signal);
  c.abort();
  await assert.rejects(p, { code: ErrorCodes.ABORTED });
});

test('abortable rejects immediately and skips work for aborted signal', async () => {
  let ran = false;
  await assert.rejects(
    abortable(async () => {
      ran = true;
    }, AbortSignal.abort()),
    { code: ErrorCodes.ABORTED },
  );
  assert.equal(ran, false);
});
