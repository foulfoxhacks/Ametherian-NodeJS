import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  retry,
  backoffDelay,
  sleep,
  createConcurrencyLimit,
  createRateLimiter,
  createCircuitBreaker,
  CIRCUIT_OPEN,
} from '../src/index.js';
import { TimeoutError, AmetherianError, ErrorCodes } from '@foulfoxhacks/ametherian-core';

const noSleep = async () => {};

test('backoffDelay grows exponentially, caps, and jitters', () => {
  const o = { minDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: 'none' };
  assert.deepEqual([1, 2, 3, 4, 5].map((a) => backoffDelay(a, o)), [100, 200, 400, 800, 1000]);
  assert.equal(backoffDelay(3, { ...o, jitter: 'full' }, () => 0.5), 200);
  assert.equal(backoffDelay(3, { ...o, jitter: 'full' }, () => 0), 0);
});

test('retry retries retryable errors then succeeds', async () => {
  const seen = [];
  const out = await retry(
    async ({ attempt }) => {
      if (attempt < 3) throw new TimeoutError();
      return 'ok';
    },
    { sleep: noSleep, onRetry: (i) => seen.push(i.attempt) },
  );
  assert.equal(out, 'ok');
  assert.deepEqual(seen, [1, 2]);
});

test('retry does not retry non-retryable errors by default', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => {
      calls++;
      throw new Error('plain');
    }, { sleep: noSleep }),
    /plain/,
  );
  assert.equal(calls, 1);
});

test('retry gives up after retries and rethrows last error', async () => {
  let calls = 0;
  await assert.rejects(
    retry(async () => {
      calls++;
      throw new TimeoutError(`t${calls}`);
    }, { retries: 2, sleep: noSleep }),
    /t3/,
  );
  assert.equal(calls, 3);
});

test('retry honours retryAfterMs hint capped by maxDelayMs', async () => {
  const delays = [];
  let n = 0;
  await retry(
    async () => {
      if (n++ === 0) throw new AmetherianError('busy', { retryable: true, details: { retryAfterMs: 50_000 } });
      return 1;
    },
    { maxDelayMs: 2000, sleep: async (ms) => delays.push(ms) },
  );
  assert.deepEqual(delays, [2000]);
});

test('retry stops on abort during wait', async () => {
  const c = new AbortController();
  const p = retry(async () => {
    throw new TimeoutError();
  }, { minDelayMs: 10_000, jitter: 'none', signal: c.signal });
  setTimeout(() => c.abort(), 5);
  await assert.rejects(p, { code: ErrorCodes.ABORTED });
});

test('retry validates options', async () => {
  await assert.rejects(retry(async () => 1, { retries: -1 }), { code: ErrorCodes.CONFIG });
});

test('sleep is abortable', async () => {
  await assert.rejects(sleep(10, AbortSignal.abort()), { code: ErrorCodes.ABORTED });
  await sleep(1);
});

test('concurrency limit caps active tasks and runs queue in order', async () => {
  const lim = createConcurrencyLimit({ maxConcurrent: 2 });
  let running = 0;
  let peak = 0;
  const order = [];
  const task = (id) => async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    order.push(id);
    running--;
    return id;
  };
  const results = await Promise.all([1, 2, 3, 4, 5].map((i) => lim.run(task(i))));
  assert.deepEqual(results, [1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.equal(lim.active, 0);
});

test('concurrency limit rejects when queue is full and on abort', async () => {
  const lim = createConcurrencyLimit({ maxConcurrent: 1, maxQueue: 1 });
  let release;
  const blocker = lim.run(() => new Promise((r) => (release = r)));
  const c = new AbortController();
  const queued = lim.run(() => 'never', { signal: c.signal });
  await assert.rejects(lim.run(() => 'x'), { code: ErrorCodes.LIMIT_EXCEEDED });
  c.abort();
  await assert.rejects(queued, { code: ErrorCodes.ABORTED });
  assert.equal(lim.pending, 0);
  release('done');
  assert.equal(await blocker, 'done');
  await assert.rejects(lim.run(() => 1, { signal: AbortSignal.abort() }), { code: ErrorCodes.ABORTED });
});

test('concurrency limit frees slot when task throws', async () => {
  const lim = createConcurrencyLimit({ maxConcurrent: 1 });
  await assert.rejects(lim.run(() => {
    throw new Error('x');
  }), /x/);
  assert.equal(await lim.run(() => 2), 2);
});

test('rate limiter refills over time', () => {
  let t = 0;
  const rl = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: () => t });
  assert.equal(rl.tryRemove(), true);
  assert.equal(rl.tryRemove(), true);
  assert.equal(rl.tryRemove(), false);
  assert.equal(rl.msUntilAvailable(), 1000);
  t = 500;
  assert.equal(rl.tryRemove(), false);
  t = 1000;
  assert.equal(rl.tryRemove(), true);
  t = 10_000;
  assert.equal(rl.tokens, 2, 'never exceeds capacity');
  assert.throws(() => rl.tryRemove(3), RangeError);
  assert.equal(createRateLimiter({ capacity: 1, refillPerSecond: 0, now: () => 0 }).msUntilAvailable(2), Infinity);
});

test('circuit breaker opens, fails fast, half-opens and closes', async () => {
  let t = 0;
  const cb = createCircuitBreaker({ failureThreshold: 2, resetMs: 1000, now: () => t });
  const fail = async () => {
    throw new Error('down');
  };
  await assert.rejects(cb.run(fail), /down/);
  assert.equal(cb.state, 'closed');
  await assert.rejects(cb.run(fail), /down/);
  assert.equal(cb.state, 'open');
  let called = false;
  await assert.rejects(cb.run(async () => (called = true)), (err) => {
    assert.equal(err.code, CIRCUIT_OPEN);
    assert.equal(err.details.retryAfterMs, 1000);
    return true;
  });
  assert.equal(called, false);
  t = 1000;
  assert.equal(cb.state, 'half-open');
  await assert.rejects(cb.run(fail), /down/);
  assert.equal(cb.state, 'open', 'failed trial re-opens');
  t = 2000;
  assert.equal(await cb.run(async () => 'ok'), 'ok');
  assert.equal(cb.state, 'closed');
});

test('circuit breaker allows only one half-open trial at a time', async () => {
  let t = 0;
  const cb = createCircuitBreaker({ failureThreshold: 1, resetMs: 10, now: () => t });
  await assert.rejects(cb.run(async () => {
    throw new Error('x');
  }));
  t = 10;
  let release;
  const trial = cb.run(() => new Promise((r) => (release = r)));
  await assert.rejects(cb.run(async () => 1), { code: CIRCUIT_OPEN });
  release('ok');
  assert.equal(await trial, 'ok');
});

test('isFailure lets some errors pass without counting', async () => {
  const cb = createCircuitBreaker({ failureThreshold: 1, isFailure: (e) => e.message !== 'client' });
  await assert.rejects(cb.run(async () => {
    throw new Error('client');
  }));
  assert.equal(cb.state, 'closed');
});
