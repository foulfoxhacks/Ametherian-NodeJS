/**
 * Transport built on the platform's fetch(): for Cloudflare Workers, Deno and
 * other edge runtimes where node:http is unavailable.
 *
 * Same contract as the Node transports. Redirects are never followed here
 * (redirect: 'manual'): the client re-checks every hop with the guard.
 * The body size limit is enforced on the decoded stream, so compressed
 * responses are limited after decompression. Connect-time DNS checks are not
 * possible through fetch(); URL and redirect checks still apply.
 */
import { createByteLimitStream, collectBytes, toAbortError, isAmetherianError } from '@foulfoxhacks/ametherian-core';
import { NetworkError } from './errors.js';

/**
 * @param {{ fetch?: typeof globalThis.fetch }} [options]
 */
export function createFetchTransport(options = {}) {
  const platformFetch = options.fetch ?? globalThis.fetch;
  if (typeof platformFetch !== 'function') throw new TypeError('createFetchTransport needs a fetch implementation');

  async function transport({ method, url, headers, body, signal, maxResponseBytes, stream = false }) {
    let res;
    try {
      res = await platformFetch(url.href, {
        method,
        headers,
        // A streamed body needs duplex: 'half' (request sent before the response is read).
        ...(body instanceof Uint8Array ? { body: body.byteLength ? body : undefined } : body ? { body, duplex: 'half' } : {}),
        redirect: 'manual',
        signal,
      });
    } catch (err) {
      if (isAmetherianError(err)) throw err;
      // A failing streamed body (size limit, length mismatch) surfaces as fetch's cause.
      if (isAmetherianError(err?.cause)) throw err.cause;
      if (signal?.aborted) throw toAbortError(signal.reason);
      throw new NetworkError(`Request to ${url.host} failed: ${err?.message ?? err}`, err, { host: url.host });
    }
    const pairs = [];
    res.headers.forEach((value, name) => pairs.push([name, value]));
    const head = { status: res.status, statusText: res.statusText ?? '', headers: pairs };
    if (!res.body) return { ...head, body: stream ? new ReadableStream({ start: (c) => c.close() }) : new Uint8Array(0) };
    const limited = res.body.pipeThrough(createByteLimitStream(maxResponseBytes, { resource: 'response-body' }));
    if (stream) return { ...head, body: limited };
    try {
      return { ...head, body: await collectBytes(limited, { maxBytes: maxResponseBytes, signal, resource: 'response-body' }) };
    } catch (err) {
      if (isAmetherianError(err)) throw err;
      if (signal?.aborted) throw toAbortError(signal.reason);
      throw new NetworkError(`Reading the response from ${url.host} failed`, err, { host: url.host });
    }
  }

  transport.close = () => {};
  transport.protocol = 'fetch';
  return transport;
}
