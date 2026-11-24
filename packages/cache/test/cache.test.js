import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../src/index.js';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test('get/set/has/delete basics', () => {
  const c = createCache({ maxEntries: 3 });
  c.set('a', 1);
  assert.equal(c.get('a'), 1);
  assert.equal(c.has('a'), true);
  assert.equal(c.get('missing'), undefined);
  assert.equal(c.delete('a'), true);
  assert.equal(c.delete('a'), false);
  assert.equal(c.size, 0);
});

test('evicts least recently used entry', () => {
  const evicted = [];
  const c = createCache({ maxEntries: 2, onEvict: (k, v, why) => evicted.push([k, why]) });
  c.set('a', 1).set('b', 2);
  c.get('a'); // a is now most recent
  c.set('c', 3);
  assert.equal(c.has('b'), false);
  assert.equal(c.get('a'), 1);
  assert.deepEqual(evicted, [['b', 'evicted']]);
});

test('size budget evicts until within maxSize', () => {
  const c = createCache({ maxEntries: 100, maxSize: 10, sizeOf: (v) => v.length });
  c.set('a', 'xxxx').set('b', 'xxxx').set('c', 'xxxx');
  assert.equal(c.has('a'), false);
  assert.equal(c.totalSize, 8);
  assert.throws(() => c.set('big', 'x'.repeat(11)), { code: ErrorCodes.LIMIT_EXCEEDED });
  c.set('b', 'x');
  assert.equal(c.totalSize, 5, 'replacing an entry updates size');
});

test('ttl expiry, per-entry ttl and prune', () => {
  const t = clock();
  const c = createCache({ maxEntries: 10, ttlMs: 100, now: t.now });
  c.set('a', 1);
  c.set('b', 2, { ttlMs: 500 });
  t.advance(100);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.get('b'), 2);
  c.set('c', 3);
  t.advance(500);
  assert.equal(c.prune(), 2);
  assert.equal(c.size, 0);
  assert.equal(c.stats().expirations, 3);
});

test('getOrLoad de-duplicates concurrent loads and does not cache failures', async () => {
  const c = createCache({ maxEntries: 10 });
  let calls = 0;
  const loader = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return 'v';
  };
  const [a, b] = await Promise.all([c.getOrLoad('k', loader), c.getOrLoad('k', loader)]);
  assert.equal(a, 'v');
  assert.equal(b, 'v');
  assert.equal(calls, 1);
  assert.equal(await c.getOrLoad('k', loader), 'v');
  assert.equal(calls, 1);

  let attempts = 0;
  const failing = async () => {
    attempts++;
    throw new Error('down');
  };
  await assert.rejects(c.getOrLoad('f', failing), /down/);
  await assert.rejects(c.getOrLoad('f', failing), /down/);
  assert.equal(attempts, 2);
  assert.equal(c.has('f'), false);
});

test('scopes isolate keys without delimiter collisions', () => {
  const c = createCache({ maxEntries: 10 });
  const tenantA = c.scope('a:b');
  const tenantB = c.scope('a');
  tenantA.set('c', 'A');
  tenantB.set('b:c', 'B');
  assert.equal(tenantA.get('c'), 'A');
  assert.equal(tenantB.get('b:c'), 'B');
  assert.equal(c.get('c'), undefined);
  assert.equal(tenantB.get('c'), undefined);
});

test('stats, clear and validation', () => {
  const c = createCache({ maxEntries: 1 });
  c.set('a', 1);
  c.get('a');
  c.get('x');
  c.set('b', 2);
  assert.deepEqual(c.stats(), { hits: 1, misses: 1, evictions: 1, expirations: 0, size: 1, totalSize: 0 });
  c.clear();
  assert.equal(c.size, 0);
  assert.throws(() => c.set(1, 'x'), TypeError);
  assert.throws(() => c.set('a', 1, { ttlMs: 0 }), TypeError);
  assert.throws(() => createCache({}), { code: ErrorCodes.CONFIG });
  assert.throws(() => createCache({ maxEntries: 1, maxSize: 5 }), { code: ErrorCodes.CONFIG });
});

test('a throwing onEvict does not break the cache', () => {
  const c = createCache({
    maxEntries: 1,
    onEvict: () => {
      throw new Error('x');
    },
  });
  c.set('a', 1).set('b', 2);
  assert.equal(c.get('b'), 2);
});
