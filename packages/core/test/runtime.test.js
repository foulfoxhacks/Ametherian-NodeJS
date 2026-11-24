import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeCapabilities, requireCapability } from '../src/runtime.js';
import { ErrorCodes } from '../src/errors.js';

test('detects the current Node runtime', () => {
  const caps = getRuntimeCapabilities();
  assert.equal(caps.runtime, 'node');
  assert.equal(caps.version, process.versions.node);
  assert.equal(caps.fetch, true);
  assert.equal(caps.webStreams, true);
  assert.equal(caps.abortSignalTimeout, true);
  assert.ok(Object.isFrozen(caps));
});

test('reports missing capabilities on an empty global', () => {
  const caps = getRuntimeCapabilities({});
  assert.deepEqual(
    { ...caps },
    {
      runtime: 'unknown',
      version: null,
      fetch: false,
      webStreams: false,
      abortSignalAny: false,
      abortSignalTimeout: false,
      webCrypto: false,
      structuredClone: false,
    },
  );
});

test('identifies Deno and Bun before Node shims', () => {
  const shim = { process: { versions: { node: '20.0.0' } } };
  assert.equal(getRuntimeCapabilities({ ...shim, Deno: { version: { deno: '2.0.0' } } }).runtime, 'deno');
  assert.equal(getRuntimeCapabilities({ ...shim, Bun: { version: '1.1.0' } }).runtime, 'bun');
});

test('partial fetch support is reported as false', () => {
  assert.equal(getRuntimeCapabilities({ fetch() {} }).fetch, false);
});

test('requireCapability passes for present capabilities', () => {
  requireCapability('fetch', 'webStreams');
});

test('requireCapability rejects unknown names', () => {
  assert.throws(() => requireCapability('teleport'), TypeError);
  assert.throws(() => requireCapability('runtime'), TypeError);
});

test('requireCapability throws typed error when missing', () => {
  // Manual save/restore: t.mock.property is not available on Node 20.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
  globalThis.structuredClone = undefined;
  try {
    assert.throws(() => requireCapability('structuredClone'), (err) => {
      return err.code === ErrorCodes.UNSUPPORTED && err.details.capability === 'structuredClone';
    });
  } finally {
    Object.defineProperty(globalThis, 'structuredClone', original);
  }
});
