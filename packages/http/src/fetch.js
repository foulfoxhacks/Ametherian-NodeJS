/**
 * WHATWG-style fetch() on top of the Ametherian client, for code that wants
 * undici's `fetch` shape with Ametherian's defaults (guarded destinations,
 * bounded bodies, deadlines, credential stripping, pinned TLS).
 *
 * Differences from the WHATWG fetch standard, on purpose:
 *  - destinations are checked by ametherian-guard (public-only by default);
 *  - failures reject with typed Ametherian errors (e.g. AMETHERIAN_NETWORK,
 *    AMETHERIAN_DESTINATION_BLOCKED, AMETHERIAN_TIMEOUT) instead of a bare
 *    TypeError; each still `instanceof Error`;
 *  - response bodies are size-limited and covered by the request deadline;
 *  - no cookies, no cache, no CORS (server-side client).
 */
import { ConfigError } from '@foulfoxhacks/ametherian-core';
import { own, ownGet } from './own.js';

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

async function bodyBytes(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer || body instanceof URLSearchParams) return body;
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    throw new ConfigError('Blob bodies are not supported', { problems: ['body: Blob/FormData not supported; send bytes or a string'] });
  }
  throw new ConfigError('Unsupported fetch body', { problems: ['body: expected string, ArrayBuffer, typed array or URLSearchParams'] });
}

/**
 * Bind createFetch to a runtime's createHttpClient (Node or edge).
 * @param {(options: object) => object} createHttpClient
 */
export function makeCreateFetch(createHttpClient) {
  /**
   * @param {object} [options] Same options as createHttpClient (retries default off, like fetch).
   * @returns {((input: string | URL | Request, init?: object) => Promise<Response>) & { close(): void, client: object }}
   */
  return function createFetch(options) {
  const opts = own(options);
  if (!Object.hasOwn(opts, 'retry')) opts.retry = false;
  opts.throwOnStatus = false;
  const client = createHttpClient(opts);

  async function fetch(input, init) {
    const i = own(init);
    let url;
    let method = ownGet(i, 'method');
    let headers = ownGet(i, 'headers');
    let body = ownGet(i, 'body');
    let signal = ownGet(i, 'signal');
    if (typeof Request !== 'undefined' && input instanceof Request) {
      url = input.url;
      method ??= input.method;
      headers ??= input.headers;
      signal ??= input.signal;
      if (body === undefined && input.body) body = new Uint8Array(await input.arrayBuffer());
    } else {
      url = String(input);
    }
    const redirect = ownGet(i, 'redirect') ?? 'follow';
    const res = await client.request({
      url,
      method: String(method ?? 'GET').toUpperCase(),
      headers: headers instanceof Headers ? Object.fromEntries(headers) : headers ?? {},
      ...(body !== undefined && body !== null ? { body: await bodyBytes(body) } : {}),
      ...(signal ? { signal } : {}),
      redirect,
      stream: true,
    });
    const nullBody = NULL_BODY_STATUS.has(res.status) || String(method ?? 'GET').toUpperCase() === 'HEAD';
    if (nullBody) await res.cancel().catch(() => {});
    const response = new Response(nullBody ? null : res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
    // url/redirected are not constructor options; define them as the standard getters would report.
    Object.defineProperty(response, 'url', { value: res.url, enumerable: true });
    Object.defineProperty(response, 'redirected', { value: res.redirected, enumerable: true });
    return response;
  }

  fetch.close = () => client.close();
  fetch.client = client;
  return fetch;
  };
}
