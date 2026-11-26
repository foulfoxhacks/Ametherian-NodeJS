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
 *  - no cookies, no cache, no CORS (server-side client). The `cache` modes
 *    still add the request headers fetch() would send for them;
 *  - an init option this client cannot honour (`integrity`, `dispatcher`, a
 *    `referrer` URL, `mode: 'same-origin'`, `cache: 'only-if-cached'`, or
 *    any unknown key) throws a ConfigError instead of being ignored.
 */
import { ConfigError } from '@foulfoxhacks/ametherian-core';
import { own, ownGet } from './own.js';

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);
const CACHE_MODES = new Set(['default', 'no-store', 'reload', 'no-cache', 'force-cache']);
const CONDITIONAL = ['if-modified-since', 'if-none-match', 'if-unmodified-since', 'if-match', 'if-range'];
const SUPPORTED = new Set(['method', 'headers', 'body', 'signal', 'redirect']);

/**
 * Init options that have no effect in a server-side client with no cookie jar,
 * cache, document or CORS, at the values fetch() also treats that way. Each
 * returns a problem string for a value that would change the request.
 */
const ACCEPTED = {
  cache: (v) => (CACHE_MODES.has(v) ? null
    : v === 'only-if-cached' ? "cache: 'only-if-cached' needs a cache, and this client has none"
      : `cache: unknown mode ${JSON.stringify(String(v)).slice(0, 40)}`),
  credentials: (v) => (['omit', 'same-origin', 'include'].includes(v) ? null : 'credentials: expected omit, same-origin or include'),
  mode: (v) => (['cors', 'no-cors'].includes(v) ? null
    : v === 'same-origin' ? "mode: 'same-origin' cannot be enforced by a server-side client, which has no origin"
      : `mode: ${JSON.stringify(String(v)).slice(0, 40)} is not supported`),
  referrer: (v) => (v === '' || v === 'about:client' ? null : 'referrer: no Referer is sent; set a referer header explicitly instead'),
  referrerPolicy: (v) => (typeof v === 'string' ? null : 'referrerPolicy: expected a string'),
  integrity: (v) => (v === '' ? null : 'integrity: subresource integrity is not verified by this client'),
  keepalive: (v) => (typeof v === 'boolean' ? null : 'keepalive: expected a boolean'),
  priority: (v) => (['high', 'low', 'auto'].includes(v) ? null : 'priority: expected high, low or auto'),
  duplex: (v) => (v === 'half' ? null : "duplex: only 'half' is supported"),
  window: (v) => (v === null ? null : 'window: only null is allowed'),
  dispatcher: () => 'dispatcher: undici dispatchers do not apply; configure this client through createFetch() options',
};

/** Fail loudly on any init option the client would otherwise silently drop. */
function checkOptions(effective) {
  const problems = [];
  for (const key of Object.keys(effective)) {
    const value = effective[key];
    if (value === undefined || SUPPORTED.has(key)) continue;
    const check = Object.hasOwn(ACCEPTED, key) ? ACCEPTED[key] : null;
    const problem = check ? check(value) : `${String(key).slice(0, 40)}: not a fetch option this client supports`;
    if (problem) problems.push(problem);
  }
  if (problems.length) throw new ConfigError('Unsupported fetch options', { problems });
}

/**
 * Every WHATWG HeadersInit form (Headers, record, array of pairs) as one
 * lower-cased null-prototype record. Repeated names are joined with ", ", as
 * Headers joins them. Name and value validation happens in the client.
 */
function headerRecord(headers) {
  const out = Object.create(null);
  if (headers === undefined || headers === null) return out;
  let entries;
  if (headers instanceof Headers) entries = [...headers];
  else if (Array.isArray(headers)) {
    entries = headers.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new ConfigError('Invalid headers', { problems: ['headers: each array entry must be a [name, value] pair'] });
      }
      return pair;
    });
  } else if (typeof headers === 'object') entries = Object.entries(headers);
  else throw new ConfigError('Invalid headers', { problems: ['headers: expected Headers, an object or an array of [name, value] pairs'] });
  for (const [name, value] of entries) {
    if (value === undefined || value === null) continue;
    const key = String(name).toLowerCase();
    out[key] = key in out ? `${out[key]}, ${value}` : String(value);
  }
  return out;
}

/** The request headers fetch() adds for a cache mode (Fetch standard, HTTP-network-or-cache fetch, steps 15-17). */
function applyCacheMode(mode, headers) {
  let effective = mode ?? 'default';
  if (effective === 'default' && CONDITIONAL.some((name) => name in headers)) effective = 'no-store';
  if (effective === 'no-cache' && !('cache-control' in headers)) headers['cache-control'] = 'max-age=0';
  if (effective === 'no-store' || effective === 'reload') {
    if (!('pragma' in headers)) headers.pragma = 'no-cache';
    if (!('cache-control' in headers)) headers['cache-control'] = 'no-cache';
  }
}

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
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    // A Request carries its own options; init overrides them, as in fetch().
    const effective = isRequest
      ? Object.assign(Object.create(null), {
        cache: input.cache, redirect: input.redirect, integrity: input.integrity,
        mode: input.mode === 'navigate' ? 'cors' : input.mode, referrer: input.referrer,
      }, i)
      : i;
    checkOptions(effective);
    let url;
    let method = ownGet(i, 'method');
    let headers = ownGet(i, 'headers');
    let body = ownGet(i, 'body');
    let signal = ownGet(i, 'signal');
    if (isRequest) {
      url = input.url;
      method ??= input.method;
      headers ??= input.headers;
      signal ??= input.signal;
      if (body === undefined && input.body) body = new Uint8Array(await input.arrayBuffer());
    } else {
      url = String(input);
    }
    const redirect = effective.redirect ?? 'follow';
    const requestHeaders = headerRecord(headers);
    applyCacheMode(effective.cache, requestHeaders);
    const res = await client.request({
      url,
      method: String(method ?? 'GET').toUpperCase(),
      headers: requestHeaders,
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
