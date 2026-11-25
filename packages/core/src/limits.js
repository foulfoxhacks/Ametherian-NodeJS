/**
 * Resource-limit helpers. Limits are explicit and reported in errors so they
 * are observable to callers and logs.
 */
import { LimitExceededError, ConfigError } from './errors.js';
import { throwIfAborted } from './cancel.js';

// TextEncoder instead of Buffer: works in Node, Cloudflare Workers, Deno and browsers.
const utf8 = new TextEncoder();

function checkLimit(limit, name = 'limit') {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) {
    throw new ConfigError(`${name} must be a non-negative integer`, {
      problems: [`${name}: expected integer >= 0, got ${String(limit)}`],
    });
  }
}

/**
 * Throw LimitExceededError when `actual > limit`.
 * @param {number} actual
 * @param {number} limit
 * @param {string} [resource]
 */
export function assertWithinLimit(actual, limit, resource = 'resource') {
  checkLimit(limit);
  if (actual > limit) {
    throw new LimitExceededError(`${resource} exceeded limit of ${limit} (got ${actual})`, {
      limit,
      actual,
      resource,
    });
  }
}

function byteLength(chunk) {
  if (typeof chunk === 'string') return utf8.encode(chunk).byteLength;
  if (chunk instanceof ArrayBuffer) return chunk.byteLength;
  if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
  throw new TypeError('Expected string, ArrayBuffer or ArrayBufferView chunk');
}

/**
 * A web TransformStream that passes bytes through and errors with
 * LimitExceededError once more than `maxBytes` have been seen.
 * @param {number} maxBytes
 * @param {{ resource?: string }} [options]
 * @returns {TransformStream}
 */
export function createByteLimitStream(maxBytes, options = {}) {
  checkLimit(maxBytes, 'maxBytes');
  const resource = options.resource ?? 'stream';
  let seen = 0;
  return new TransformStream({
    transform(chunk, controller) {
      seen += byteLength(chunk);
      if (seen > maxBytes) {
        controller.error(
          new LimitExceededError(`${resource} exceeded ${maxBytes} bytes`, { limit: maxBytes, actual: seen, resource }),
        );
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/**
 * Read an async iterable of byte chunks into one Uint8Array, stopping with
 * LimitExceededError as soon as `maxBytes` would be exceeded. Never buffers
 * more than `maxBytes` plus one chunk.
 *
 * @param {AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>} source
 * @param {{ maxBytes: number, signal?: AbortSignal, resource?: string }} options
 * @returns {Promise<Uint8Array>}
 */
export async function collectBytes(source, options) {
  const { maxBytes, signal, resource = 'body' } = options ?? {};
  checkLimit(maxBytes, 'maxBytes');
  throwIfAborted(signal);
  const chunks = [];
  let total = 0;
  for await (const chunk of source) {
    throwIfAborted(signal);
    const bytes = typeof chunk === 'string' ? utf8.encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) {
      throw new LimitExceededError(`${resource} exceeded ${maxBytes} bytes`, { limit: maxBytes, actual: total, resource });
    }
    chunks.push(bytes);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c instanceof Uint8Array ? c : new Uint8Array(c.buffer, c.byteOffset, c.byteLength), offset);
    offset += c.byteLength;
  }
  return out;
}
