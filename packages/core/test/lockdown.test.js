// Runs in its own process: lockdown is irreversible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockdownPrototypes, detectPrototypePollution, PROTOTYPE_POLLUTED } from '../src/integrity.js';

test('lockdown refuses when already polluted', () => {
  Object.prototype.polluted = 1;
  try {
    assert.throws(lockdownPrototypes, { code: PROTOTYPE_POLLUTED });
  } finally {
    delete Object.prototype.polluted;
  }
});

test('after lockdown, prototype pollution is impossible', () => {
  assert.deepEqual(lockdownPrototypes().frozen, ['Object.prototype', 'Function.prototype', 'Array.prototype']);
  const victim = {};
  // Classic merge-style pollution attempt.
  const payload = JSON.parse('{"__proto__":{"signal":"x"}}');
  // Merging into victim.__proto__ (=== Object.prototype) now throws instead of polluting.
  assert.throws(() => {
    for (const k of Object.keys(payload)) Object.assign(victim[k] ?? (victim[k] = {}), payload[k]);
  }, TypeError);
  assert.throws(() => {
    'use strict';
    Object.prototype.signal = 'x';
  }, TypeError);
  assert.equal({}.signal, undefined);
  assert.deepEqual(detectPrototypePollution(), []);
  assert.ok(Object.isFrozen(Object.prototype));
});
