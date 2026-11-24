import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourceScope, asyncDispose, dispose, CLEANUP_FAILED } from '../src/lifecycle.js';
import { createEventHub } from '../src/events.js';

test('scope runs cleanups in reverse order, once', async () => {
  const order = [];
  const scope = createResourceScope();
  scope.defer(() => order.push('a'));
  scope.defer(async () => order.push('b'));
  scope.use({ close: () => order.push('close') });
  scope.use({ [dispose]: () => order.push('dispose') });
  scope.use({ [asyncDispose]: async () => order.push('asyncDispose') });
  scope.use({ destroy: () => order.push('destroy') });
  await scope.close();
  await scope.close();
  assert.deepEqual(order, ['destroy', 'asyncDispose', 'dispose', 'close', 'b', 'a']);
  assert.equal(scope.closed, true);
});

test('scope prefers asyncDispose over close', async () => {
  const calls = [];
  const scope = createResourceScope();
  scope.use({ close: () => calls.push('close'), [asyncDispose]: () => calls.push('async') });
  await scope.close();
  assert.deepEqual(calls, ['async']);
});

test('cleanup failures are all reported and do not stop other cleanups', async () => {
  const ran = [];
  const scope = createResourceScope();
  scope.defer(() => ran.push(1));
  scope.defer(() => {
    throw new Error('first');
  });
  scope.defer(async () => {
    throw new Error('second');
  });
  await assert.rejects(scope.close(), (err) => {
    assert.equal(err.code, CLEANUP_FAILED);
    assert.equal(err.errors.length, 2);
    assert.equal(err.errors[0].message, 'second');
    assert.equal(err.details.count, 2);
    return true;
  });
  assert.deepEqual(ran, [1]);
});

test('closed scope refuses new resources; bad inputs are TypeErrors', async () => {
  const scope = createResourceScope();
  assert.throws(() => scope.defer('x'), TypeError);
  assert.throws(() => scope.use({}), TypeError);
  assert.throws(() => scope.use(null), TypeError);
  await scope.close();
  assert.throws(() => scope.defer(() => {}), { code: CLEANUP_FAILED });
});

test('scope is async-disposable', async () => {
  const scope = createResourceScope();
  let closed = false;
  scope.defer(() => (closed = true));
  await scope[asyncDispose]();
  assert.equal(closed, true);
});

test('event hub delivers to named and any listeners', () => {
  const hub = createEventHub();
  const seen = [];
  const off = hub.on('request', (p) => seen.push(['request', p.id]));
  hub.onAny((name, p) => seen.push(['any', name, p.id]));
  hub.emit('request', { id: 1 });
  hub.emit('other', { id: 2 });
  off();
  hub.emit('request', { id: 3 });
  assert.deepEqual(seen, [
    ['request', 1],
    ['any', 'request', 1],
    ['any', 'other', 2],
    ['any', 'request', 3],
  ]);
});

test('listener errors are isolated and reported', async () => {
  const reported = [];
  const hub = createEventHub({ onListenerError: (err, name) => reported.push([err.message, name]) });
  let reached = false;
  hub.on('e', () => {
    throw new Error('sync');
  });
  hub.on('e', async () => {
    throw new Error('async');
  });
  hub.on('e', () => (reached = true));
  hub.emit('e');
  assert.equal(reached, true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(reported, [
    ['sync', 'e'],
    ['async', 'e'],
  ]);
});

test('a throwing error reporter does not break emit', () => {
  const hub = createEventHub({
    onListenerError: () => {
      throw new Error('reporter');
    },
  });
  hub.on('e', () => {
    throw new Error('x');
  });
  hub.emit('e');
});

test('hasListeners reflects subscriptions', () => {
  const hub = createEventHub();
  assert.equal(hub.hasListeners('a'), false);
  const off = hub.on('a', () => {});
  assert.equal(hub.hasListeners('a'), true);
  off();
  assert.equal(hub.hasListeners('a'), false);
  const offAny = hub.onAny(() => {});
  assert.equal(hub.hasListeners('zzz'), true);
  offAny();
  assert.throws(() => hub.on('a', null), TypeError);
});

test('unsubscribing during emit does not skip other listeners', () => {
  const hub = createEventHub();
  const calls = [];
  let offB;
  hub.on('e', () => {
    calls.push('a');
    offB();
  });
  offB = hub.on('e', () => calls.push('b'));
  hub.emit('e');
  assert.deepEqual(calls, ['a', 'b']);
});
