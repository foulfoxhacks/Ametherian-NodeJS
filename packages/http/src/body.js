/**
 * Shared response-body handling for the HTTP/1.1 and HTTP/2 transports:
 * decompression, size limits (counted after decompression), and either a
 * buffered Uint8Array or a backpressured web ReadableStream.
 */
import zlib from 'node:zlib';
import { LimitExceededError, isAmetherianError } from '@foulfoxhacks/ametherian-core';
import { NetworkError } from './errors.js';

export function decoderFor(encoding) {
  switch (String(encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return null; // identity or unknown: raw bytes, header kept so the caller can tell
  }
}

function limitError(maxResponseBytes, total) {
  return new LimitExceededError(`Response body exceeded ${maxResponseBytes} bytes`, {
    limit: maxResponseBytes,
    actual: total,
    resource: 'response-body',
  });
}

const asNetwork = (e) => (isAmetherianError(e) ? e : new NetworkError('Response stream failed', e));

/**
 * @param {import('node:stream').Readable} raw response stream from node:http / node:http2
 * @param {string | undefined} encoding Content-Encoding header value
 * @param {{ maxResponseBytes: number, stream?: boolean, decompress?: boolean }} opts
 * @returns {{ decoded: boolean, body: Promise<Uint8Array> | ReadableStream<Uint8Array>, destroy: (err?: Error) => void }}
 */
export function bodyFrom(raw, encoding, opts) {
  const decoder = opts.decompress === false ? null : decoderFor(encoding);
  const source = decoder ? raw.pipe(decoder) : raw;
  const destroy = (err) => {
    raw.destroy(err);
    decoder?.destroy(err);
  };
  let total = 0;

  if (opts.stream) {
    let done = false;
    const body = new ReadableStream(
      {
        start(controller) {
          const fail = (e) => {
            if (done) return;
            done = true;
            try {
              controller.error(asNetwork(e));
            } catch {
              // already errored
            }
          };
          source.on('data', (chunk) => {
            if (done) return;
            total += chunk.length;
            if (total > opts.maxResponseBytes) {
              fail(limitError(opts.maxResponseBytes, total));
              destroy();
              return;
            }
            controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
            if ((controller.desiredSize ?? 1) <= 0) source.pause();
          });
          source.on('end', () => {
            if (done) return;
            done = true;
            controller.close();
          });
          source.on('error', fail);
          if (decoder) raw.on('error', fail);
        },
        pull() {
          source.resume();
        },
        cancel() {
          done = true;
          destroy();
        },
      },
      { highWaterMark: 8 },
    );
    return { decoded: Boolean(decoder), body, destroy };
  }

  const body = new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      reject(asNetwork(e));
    };
    source.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > opts.maxResponseBytes) {
        fail(limitError(opts.maxResponseBytes, total));
        destroy();
        return;
      }
      chunks.push(chunk);
    });
    source.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    source.on('error', fail);
    if (decoder) raw.on('error', fail);
  });
  body.catch(() => {}); // the caller always attaches a handler; avoid unhandled-rejection noise on races
  return { decoded: Boolean(decoder), body, destroy };
}

/** Header pairs, dropping content-encoding/length when the body was decoded. */
export function responseHeaderPairs(pairs, decoded) {
  return decoded ? pairs.filter(([k]) => !/^content-(encoding|length)$/i.test(k)) : pairs;
}

/** First Ametherian error in an error's cause chain (e.g. a guard block wrapped by node:http2). */
export function ametherianCause(err, depth = 0) {
  if (!err || depth > 8) return null;
  if (isAmetherianError(err)) return err;
  return ametherianCause(err.cause, depth + 1);
}

/**
 * Write a web ReadableStream request body to a node:http ClientRequest or an
 * HTTP/2 stream with backpressure, then end it. Stops reading and cancels the
 * source when the request closes early (abort, error, early response); a
 * source error destroys the request with that error.
 *
 * @param {import('node:stream').Writable} req
 * @param {ReadableStream<Uint8Array>} stream
 */
export function writeStreamBody(req, stream) {
  const reader = stream.getReader();
  let stopped = false;
  const onClose = () => {
    if (stopped) return;
    stopped = true;
    reader.cancel().catch(() => {});
  };
  req.once('close', onClose);
  const drained = () => new Promise((resolve) => {
    const done = () => {
      req.off('drain', done);
      req.off('close', done);
      resolve();
    };
    req.on('drain', done);
    req.on('close', done);
  });
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (stopped) return;
        if (done) {
          stopped = true;
          req.off('close', onClose);
          req.end();
          return;
        }
        if (!req.write(value)) await drained();
      }
    } catch (err) {
      if (stopped) return;
      stopped = true;
      req.off('close', onClose);
      req.destroy(err);
    }
  })();
}
