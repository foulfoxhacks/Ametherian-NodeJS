import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPrototypePollution,
  assertNoPrototypePollution,
  checkNodeVersion,
  assertNodeVersion,
  PROTOTYPE_POLLUTED,
  RUNTIME_OUTDATED,
} from '../src/integrity.js';

function withPollution(key, value, fn) {
  Object.defineProperty(Object.prototype, key, { value, configurable: true, writable: true, enumerable: false });
  try {
    return fn();
  } finally {
    delete Object.prototype[key];
  }
}

test('clean runtime reports no pollution', () => {
  assert.deepEqual(detectPrototypePollution(), []);
  assertNoPrototypePollution();
});

test('detects string and symbol keys, including non-enumerable ones', () => {
  withPollution('signal', AbortSignal.abort(), () => {
    assert.deepEqual(detectPrototypePollution(), ['signal']);
    assert.throws(assertNoPrototypePollution, (err) => {
      assert.equal(err.code, PROTOTYPE_POLLUTED);
      assert.deepEqual([...err.details.keys], ['signal']);
      assert.ok(!JSON.stringify(err).includes('AbortSignal'), 'values are never reported');
      return true;
    });
  });
  const sym = Symbol('gadget');
  Object.prototype[sym] = 1;
  try {
    assert.deepEqual(detectPrototypePollution(), ['Symbol(gadget)']);
  } finally {
    delete Object.prototype[sym];
  }
  assert.deepEqual(detectPrototypePollution(), []);
});

test('JSON.parse("__proto__") style payloads do not pollute; Object.assign onto prototype does', () => {
  JSON.parse('{"__proto__":{"polluted":1}}');
  assert.deepEqual(detectPrototypePollution(), []);
  withPollution('polluted', 1, () => assert.deepEqual(detectPrototypePollution(), ['polluted']));
});

test('checkNodeVersion compares against per-major security minimums', () => {
  const min = { 20: '20.19.6', 22: '22.21.1' };
  assert.deepEqual(checkNodeVersion(min, 'v22.21.1'), { ok: true, current: 'v22.21.1', major: 22, required: '22.21.1' });
  assert.equal(checkNodeVersion(min, 'v22.22.0').ok, true);
  assert.equal(checkNodeVersion(min, 'v22.21.0').reason, 'below-security-minimum');
  assert.equal(checkNodeVersion(min, 'v20.5.1').ok, false);
  assert.equal(checkNodeVersion(min, 'v18.20.0').reason, 'unsupported-major');
  assert.equal(checkNodeVersion(min, 'nope').reason, 'unparseable-version');
  assert.throws(() => assertNodeVersion(min, 'v20.0.0'), { code: RUNTIME_OUTDATED });
  assert.equal(assertNodeVersion(min, 'v20.19.6').ok, true);
});
