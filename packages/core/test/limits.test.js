import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertWithinLimit, createByteLimitStream, collectBytes } from '../src/limits.js';
import { ErrorCodes } from '../src/errors.js';

test('assertWithinLimit allows equal and below', () => {
  assertWithinLimit(0, 0);
  assertWithinLimit(5, 5);
  assertWithinLimit(4, 5);
});

test('assertWithinLimit throws with details', () => {
  assert.throws(
    () => assertWithinLimit(6, 5, 'headers'),
    (err) =>
      err.code === ErrorCodes.LIMIT_EXCEEDED &&
      err.details.limit === 5 &&
      err.details.actual === 6 &&
      err.details.resource === 'headers',
  );
});

test('invalid limits are config errors', () => {
  for (const bad of [-1, 1.5, NaN, '3', undefined]) {
    assert.throws(() => assertWithinLimit(0, bad), { code: ErrorCodes.CONFIG });
    assert.throws(() => createByteLimitStream(bad), { code: ErrorCodes.CONFIG });
  }
});

async function pipeThroughLimit(chunks, max) {
  const source = ReadableStream.from(chunks);
  const out = [];
  for await (const c of source.pipeThrough(createByteLimitStream(max, { resource: 'upload' }))) out.push(c);
  return out;
}

test('byte limit stream passes data within limit', async () => {
  const out = await pipeThroughLimit([new Uint8Array(3), 'ab', new Uint8Array(5).buffer], 10);
  assert.equal(out.length, 3);
});

test('byte limit stream errors past limit', async () => {
  await assert.rejects(pipeThroughLimit([new Uint8Array(6), new Uint8Array(6)], 10), (err) => {
    return err.code === ErrorCodes.LIMIT_EXCEEDED && err.details.actual === 12 && err.details.resource === 'upload';
  });
});

test('byte limit counts multi-byte strings as UTF-8 bytes', async () => {
  await assert.rejects(pipeThroughLimit(['é'], 1), { code: ErrorCodes.LIMIT_EXCEEDED });
});

test('collectBytes concatenates chunks', async () => {
  async function* gen() {
    yield new Uint8Array([1, 2]);
    yield 'A';
    yield Buffer.from([3]);
  }
  assert.deepEqual([...(await collectBytes(gen(), { maxBytes: 4 }))], [1, 2, 65, 3]);
});

test('collectBytes stops early past limit', async () => {
  let pulled = 0;
  async function* gen() {
    for (;;) {
      pulled++;
      yield new Uint8Array(4);
    }
  }
  await assert.rejects(collectBytes(gen(), { maxBytes: 10 }), { code: ErrorCodes.LIMIT_EXCEEDED });
  assert.equal(pulled, 3);
});

test('collectBytes honours abort', async () => {
  await assert.rejects(collectBytes([new Uint8Array(1)], { maxBytes: 10, signal: AbortSignal.abort() }), {
    code: ErrorCodes.ABORTED,
  });
});

test('collectBytes requires maxBytes', async () => {
  await assert.rejects(collectBytes([], {}), { code: ErrorCodes.CONFIG });
});
