/**
 * Request bodies: buffered bytes or a single-use stream.
 *
 * Portable (no Node built-ins): shared by the Node and edge builds. A stream
 * body is a web ReadableStream or any async iterable of byte chunks (Node
 * Readable streams included). It is wrapped so that `maxRequestBytes` and an
 * optional exact `contentLength` are enforced while it is read, and the
 * source is cancelled when the wrapper is cancelled.
 */
import { ConfigError, LimitExceededError } from '@foulfoxhacks/ametherian-core';

const encoder = new TextEncoder();

/** Is `body` a stream body (ReadableStream or async iterable, but not a string)? */
export function isStreamBody(body) {
  if (body === null || typeof body !== 'object') return false;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return true;
  return typeof body[Symbol.asyncIterator] === 'function';
}

function chunkBytes(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (typeof chunk === 'string') return encoder.encode(chunk);
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  throw new ConfigError('Unsupported chunk in a streamed request body', {
    problems: ['body: stream chunks must be Uint8Array, ArrayBuffer views, ArrayBuffer or strings'],
  });
}

function sourceOf(body) {
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    if (body.locked) throw new ConfigError('Request body stream is locked or already used', { problems: ['body: stream is locked'] });
    const reader = body.getReader();
    return { next: () => reader.read(), cancel: (reason) => reader.cancel(reason) };
  }
  const iterator = body[Symbol.asyncIterator]();
  return {
    next: () => iterator.next(),
    cancel: async (reason) => {
      await iterator.return?.(reason);
    },
  };
}

/**
 * Wrap a stream body. Errors with LimitExceededError (resource
 * 'request-body') past `maxBytes`, and with ConfigError when the byte count
 * does not match `contentLength` exactly.
 *
 * @param {ReadableStream | AsyncIterable<unknown>} body
 * @param {{ maxBytes: number, contentLength?: number }} limits
 * @returns {ReadableStream<Uint8Array>}
 */
export function limitedStreamBody(body, { maxBytes, contentLength }) {
  const source = sourceOf(body);
  let seen = 0;
  let finished = false;
  const stop = (reason) => {
    if (finished) return;
    finished = true;
    source.cancel(reason).catch(() => {});
  };
  return new ReadableStream({
    async pull(controller) {
      let step;
      try {
        step = await source.next();
      } catch (err) {
        finished = true;
        controller.error(err);
        return;
      }
      if (step.done) {
        finished = true;
        if (contentLength !== undefined && seen !== contentLength) {
          controller.error(new ConfigError(`Streamed request body ended after ${seen} of ${contentLength} declared bytes`, {
            problems: [`contentLength: declared ${contentLength}, sent ${seen}`],
          }));
          return;
        }
        controller.close();
        return;
      }
      let bytes;
      try {
        bytes = chunkBytes(step.value);
      } catch (err) {
        stop(err);
        controller.error(err);
        return;
      }
      seen += bytes.byteLength;
      if (seen > maxBytes) {
        const err = new LimitExceededError(`Request body exceeds ${maxBytes} bytes`, { limit: maxBytes, actual: seen, resource: 'request-body' });
        stop(err);
        controller.error(err);
        return;
      }
      if (contentLength !== undefined && seen > contentLength) {
        const err = new ConfigError(`Streamed request body is longer than the declared ${contentLength} bytes`, {
          problems: [`contentLength: declared ${contentLength}, sent at least ${seen}`],
        });
        stop(err);
        controller.error(err);
        return;
      }
      if (bytes.byteLength) controller.enqueue(bytes);
    },
    cancel(reason) {
      stop(reason);
    },
  }, { highWaterMark: 0 });
}
