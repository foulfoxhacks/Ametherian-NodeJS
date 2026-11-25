import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ametherian from '../src/index.js';

test('exposes every package as a namespace', () => {
  assert.deepEqual(Object.keys(ametherian).sort(), ['cache', 'core', 'guard', 'http', 'minification', 'observability', 'resilience', 'schema', 'security']);
  assert.equal(typeof ametherian.core.createDeadline, 'function');
  assert.equal(typeof ametherian.http.createHttpClient, 'function');
  assert.equal(typeof ametherian.guard.createDestinationPolicy, 'function');
});

test('namespaces share one core (errors are recognised across packages)', () => {
  const err = (() => {
    try {
      ametherian.guard.createDestinationPolicy().checkUrl('http://127.0.0.1/');
    } catch (e) {
      return e;
    }
  })();
  assert.ok(ametherian.core.isAmetherianError(err));
  assert.ok(err instanceof ametherian.core.AmetherianError);
});
