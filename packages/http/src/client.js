/**
 * HTTP client with secure defaults:
 *  - every destination and redirect hop goes through an ametherian-guard policy
 *    (public addresses only unless configured), including at DNS time;
 *  - credentials are stripped on cross-origin redirects;
 *  - per-attempt deadline, response size limit (after decompression);
 *  - retries only idempotent methods on retryable failures.
 */
import {
  validateOptions,
  createDeadline,
  collectBytes,
  throwIfAborted,
  redactUrl,
  ConfigError,
  isAmetherianError,
  AmetherianError,
  LimitExceededError,
  assertNoPrototypePollution,
} from '@foulfoxhacks/ametherian-core';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { retry } from '@foulfoxhacks/ametherian-resilience';
import { parseJson } from '@foulfoxhacks/ametherian-schema';
import { createNodeTransport } from './transport.js';
import { createHttp2Transport } from './http2.js';
import { HttpStatusError, TOO_MANY_REDIRECTS, BASE_URL_ESCAPE } from './errors.js';
import { own, ownGet } from './hardening.js';

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// eslint-disable-next-line no-control-regex
const HEADER_VALUE_BAD = /[\x00-\x08\x0a-\x1f\x7f]/;
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']);
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

const CLIENT_SCHEMA = {
  baseUrl: { type: 'string' },
  headers: { type: 'object', default: {} },
  timeoutMs: { type: 'integer', min: 1, default: 30_000 },
  maxResponseBytes: { type: 'integer', min: 0, default: 10 * 1024 * 1024 },
  maxRedirects: { type: 'integer', min: 0, max: 20, default: 5 },
  throwOnStatus: { type: 'boolean', default: true },
  policy: { type: 'object' },
  hooks: { type: 'object' },
  transport: { type: 'function' },
  userAgent: { type: 'string', default: 'ametherian-http/0.1.0' },
  proxy: { type: 'string' },
  http2: { type: 'boolean', default: false },
  // With baseUrl set, absolute or protocol-relative request URLs to another origin are refused
  // (axios CVE-2025-27152 / CVE-2024-39338, undici CVE-2022-35949 class).
  allowAbsoluteUrls: { type: 'boolean', default: false },
  // Fail closed when Object.prototype is polluted: some Node internals (e.g. options.signal in
  // stream constructors) read inherited values that no library can shadow.
  pollutionCheck: { type: 'boolean', default: true },
  maxRequestBytes: { type: 'integer', min: 0, default: 10 * 1024 * 1024 },
  maxSocketsPerOrigin: { type: 'integer', min: 1, max: 10_000, default: 50 },
  maxTotalSockets: { type: 'integer', min: 1, max: 100_000, default: 256 },
  stripHeadersOnRedirect: {
    type: 'array',
    default: [],
    validate: (v) => (v.every((h) => typeof h === 'string' && h) ? undefined : 'entries must be header names'),
  },
};

const REQUEST_SCHEMA = {
  method: { type: 'string', default: 'GET', validate: (m) => (/^[A-Z]+$/.test(m) ? undefined : 'must be an upper-case token') },
  url: { type: 'string', required: true },
  headers: { type: 'object', default: {} },
  signal: { type: 'signal' },
  timeoutMs: { type: 'integer', min: 1 },
  maxResponseBytes: { type: 'integer', min: 0 },
  throwOnStatus: { type: 'boolean' },
  stream: { type: 'boolean', default: false },
  maxRequestBytes: { type: 'integer', min: 0 },
  redirect: { type: 'string', oneOf: ['follow', 'manual', 'error'], default: 'follow' },
};

/** Origin of a base URL, or a ConfigError if it is not an absolute URL. */
function policy0(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    throw new ConfigError('baseUrl must be an absolute URL', { problems: ['baseUrl: not an absolute URL'] });
  }
}

/** `retry` may be false (off) or retry options; undefined means defaults. */
function checkRetryOption(value, where) {
  if (value === undefined || value === false) return value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
  throw new ConfigError(`Invalid ${where}`, { problems: ['retry: expected false or an options object'] });
}

function toBytes(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString());
  throw new ConfigError('Unsupported body type', { problems: ['body: expected string, Uint8Array, ArrayBuffer or URLSearchParams'] });
}

function lowerHeaders(...sources) {
  const out = Object.create(null);
  for (const src of sources) {
    const entries = src instanceof Headers ? [...src] : Object.entries(src ?? {});
    for (const [k, v] of entries) {
      if (v === undefined || v === null) continue;
      // RFC 9110: names are tokens; values may not contain control characters other than HTAB.
      // Rejects CRLF/NUL injection (undici CVE-2022-31150, CVE-2022-35948, CVE-2023-23936; axios CVE-2026-40175).
      if (!HEADER_NAME.test(String(k))) {
        throw new ConfigError('Invalid header name', {
          problems: [`headers: name ${JSON.stringify(String(k)).slice(0, 60)} is not an RFC 9110 token`],
        });
      }
      if (HEADER_VALUE_BAD.test(String(v))) {
        throw new ConfigError('Header values must not contain control characters', {
          problems: [`headers.${k}: contains CR, LF, NUL or another control character`],
        });
      }
      out[String(k).toLowerCase()] = String(v);
    }
  }
  return out;
}

class HttpResponse {
  constructor({ status, statusText, headers, body, url, redirected }) {
    this.status = status;
    this.statusText = statusText;
    this.headers = new Headers(headers);
    this.url = url;
    this.redirected = redirected;
    this.body = body;
    Object.freeze(this);
  }
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
  text() {
    return new TextDecoder().decode(this.body);
  }
  /**
   * Parse the body as JSON with depth/size limits; optionally validate.
   * @param {{ schema?: { parse(v: unknown): any }, maxDepth?: number }} [options]
   */
  json(options = {}) {
    return parseJson(this.body, { maxBytes: Math.max(1, this.body.byteLength), maxDepth: options.maxDepth ?? 64, schema: options.schema });
  }
}

/**
 * @param {object} [options]
 */
export function createHttpClient(options) {
  // Own properties only, so a polluted Object.prototype cannot configure the client.
  const clientRest = own(options);
  const clientRetry = ownGet(options, 'retry');
  const ca = ownGet(options, 'ca');
  delete clientRest.retry;
  delete clientRest.ca;
  const o = validateOptions(clientRest, CLIENT_SCHEMA, { name: 'http client options' });
  const checkedRetry = checkRetryOption(clientRetry, 'http client options');
  const defaultRetry = checkedRetry === false ? false : own(checkedRetry ?? {});
  const baseOrigin = o.baseUrl ? policy0(o.baseUrl) : null;
  const policy = o.policy ?? createDestinationPolicy();
  for (const fn of ['checkUrl', 'checkRedirect', 'lookup']) {
    if (typeof policy[fn] !== 'function') throw new ConfigError('policy must come from createDestinationPolicy', { problems: [`policy.${fn}: missing`] });
  }
  if (o.transport && (o.proxy || o.http2 || ca)) {
    throw new ConfigError('proxy, http2 and ca configure the built-in transport; do not combine them with transport', {
      problems: ['transport: set together with proxy/http2/ca'],
    });
  }
  if (o.proxy && o.http2) {
    throw new ConfigError('HTTP/2 through a proxy is not supported', { problems: ['proxy/http2: both set'] });
  }
  const transport =
    o.transport ??
    (o.http2
      ? createHttp2Transport({ lookup: policy.lookup, ca })
      : createNodeTransport({
          lookup: policy.lookup,
          ca,
          proxy: o.proxy,
          maxSocketsPerOrigin: o.maxSocketsPerOrigin,
          maxTotalSockets: o.maxTotalSockets,
        }));
  const redirectStrip = [...CREDENTIAL_HEADERS, ...o.stripHeadersOnRedirect.map((h) => h.toLowerCase())];
  const hooks = o.hooks;
  const emit = (name, payload) => {
    if (hooks?.hasListeners?.(name)) hooks.emit(name, payload);
  };
  const defaultHeaders = lowerHeaders({ 'user-agent': o.userAgent, 'accept-encoding': 'gzip, deflate, br' }, o.headers);

  async function attempt(req, signal) {
    let url = policy.checkUrl(req.url, o.baseUrl);
    if (baseOrigin && !o.allowAbsoluteUrls && url.origin !== baseOrigin) {
      throw new AmetherianError('Request URL leaves the configured baseUrl origin', {
        code: BASE_URL_ESCAPE,
        details: { baseOrigin, url: redactUrl(url) },
      });
    }
    let method = req.method;
    let headers = { ...req.headers };
    let body = req.body;
    let redirected = false;
    for (let hop = 0; ; hop++) {
      throwIfAborted(signal);
      if (body) headers['content-length'] = String(body.byteLength);
      else delete headers['content-length'];
      const started = performance.now();
      emit('http.request', { method, url: redactUrl(url), hop });
      const raw = await transport({
        method,
        url,
        headers,
        body,
        signal,
        maxResponseBytes: req.maxResponseBytes,
        lookup: policy.lookup,
        stream: req.stream,
      });
      emit('http.response', { method, url: redactUrl(url), status: raw.status, durationMs: performance.now() - started });

      const location = raw.headers.find(([k]) => k.toLowerCase() === 'location')?.[1];
      if (REDIRECT_STATUS.has(raw.status) && location !== undefined && req.redirect !== 'manual') {
        if (req.stream) await raw.body.cancel().catch(() => {});
        if (req.redirect === 'error') {
          throw new AmetherianError('Redirect not allowed (redirect: "error")', {
            code: TOO_MANY_REDIRECTS,
            details: { maxRedirects: 0, url: redactUrl(url) },
          });
        }
        if (hop >= o.maxRedirects) {
          throw new AmetherianError(`Too many redirects (max ${o.maxRedirects})`, {
            code: TOO_MANY_REDIRECTS,
            details: { maxRedirects: o.maxRedirects, url: redactUrl(url) },
          });
        }
        const next = policy.checkRedirect(url, location);
        if (next.origin !== url.origin) {
          for (const h of redirectStrip) delete headers[h];
        }
        if (raw.status === 303 || ((raw.status === 301 || raw.status === 302) && method === 'POST')) {
          if (method !== 'HEAD') method = 'GET';
          body = undefined;
          delete headers['content-type'];
        }
        emit('http.redirect', { from: redactUrl(url), to: redactUrl(next), status: raw.status });
        url = next;
        redirected = true;
        continue;
      }
      const ok = raw.status >= 200 && raw.status < 300;
      if (req.stream) {
        if (req.throwOnStatus && !ok) {
          // Buffer the (size-limited) error body so the error carries a normal response.
          const bytes = await collectBytes(raw.body, { maxBytes: req.maxResponseBytes, signal });
          throw new HttpStatusError(new HttpResponse({ ...raw, body: bytes, url: url.href, redirected }), method);
        }
        return { raw, url: url.href, redirected };
      }
      const response = new HttpResponse({ ...raw, url: url.href, redirected });
      if (req.throwOnStatus && !response.ok) throw new HttpStatusError(response, method);
      return response;
    }
  }

  /**
   * @param {{ method?: string, url: string, headers?: object, body?: any, json?: unknown,
   *           signal?: AbortSignal, timeoutMs?: number, maxResponseBytes?: number,
   *           throwOnStatus?: boolean, retry?: object | false }} input
   */
  async function request(input) {
    if (o.pollutionCheck) assertNoPrototypePollution();
    // Own properties only: inherited `json`, `body`, `retry`, headers or method must never apply.
    const json = ownGet(input, 'json');
    const rawBody = ownGet(input, 'body');
    const retryOverride = ownGet(input, 'retry');
    const rest = own(input);
    delete rest.json;
    delete rest.body;
    delete rest.retry;
    const r = validateOptions(rest, REQUEST_SCHEMA, { name: 'request options' });
    let body = toBytes(rawBody);
    const extraHeaders = {};
    if (json !== undefined) {
      if (rawBody !== undefined) throw new ConfigError('Use either body or json, not both', { problems: ['body/json: both set'] });
      let text;
      try {
        text = JSON.stringify(json);
      } catch (err) {
        throw new ConfigError('json body could not be serialised', { problems: [`json: ${err.message}`], cause: err });
      }
      body = new TextEncoder().encode(text);
      extraHeaders['content-type'] = 'application/json';
      extraHeaders.accept = 'application/json';
    }
    const maxRequestBytes = r.maxRequestBytes ?? o.maxRequestBytes;
    if (body && body.byteLength > maxRequestBytes) {
      throw new LimitExceededError(`Request body exceeds ${maxRequestBytes} bytes`, {
        limit: maxRequestBytes,
        actual: body.byteLength,
        resource: 'request-body',
      });
    }
    const req = {
      method: r.method,
      url: r.url,
      headers: lowerHeaders(defaultHeaders, extraHeaders, r.headers),
      body,
      maxResponseBytes: r.maxResponseBytes ?? o.maxResponseBytes,
      throwOnStatus: r.throwOnStatus ?? o.throwOnStatus,
      stream: r.stream,
      redirect: r.redirect,
    };
    const timeoutMs = r.timeoutMs ?? o.timeoutMs;
    const override = checkRetryOption(retryOverride, 'request options');
    const retryConfig = override === undefined ? defaultRetry : override === false ? false : own(override);
    const canRetry = retryConfig && IDEMPOTENT.has(req.method);

    const once = async () => {
      const deadline = createDeadline(timeoutMs, { signal: r.signal });
      let keepDeadline = false;
      try {
        const out = await attempt(req, deadline.signal);
        if (!req.stream) return out;
        // Streaming: the deadline keeps covering the body until it is fully read or cancelled.
        keepDeadline = true;
        return new HttpStreamResponse({
          ...out.raw,
          url: out.url,
          redirected: out.redirected,
          body: guardStream(out.raw.body, () => deadline.dispose()),
          maxResponseBytes: req.maxResponseBytes,
        });
      } catch (err) {
        emit('http.error', { method: req.method, url: redactUrl(r.url), error: err });
        throw err;
      } finally {
        if (!keepDeadline) deadline.dispose();
      }
    };
    if (!canRetry) return once();
    return retry(once, {
      retries: 2,
      ...retryConfig,
      signal: r.signal,
      shouldRetry: (err, n) =>
        isAmetherianError(err) && err.retryable && (retryConfig.shouldRetry ? retryConfig.shouldRetry(err, n) : true),
      onRetry: (info) => {
        emit('http.retry', { method: req.method, url: redactUrl(r.url), attempt: info.attempt, delayMs: info.delayMs });
        retryConfig.onRetry?.(info);
      },
    });
  }

  const client = { request, policy, close: () => transport.close?.() };
  // Method shortcuts build the request from own properties of `opts` only.
  for (const m of ['get', 'head', 'delete', 'options']) {
    client[m] = (url, opts = {}) => request(Object.assign(own(opts), { method: m.toUpperCase(), url }));
  }
  for (const m of ['post', 'put', 'patch']) {
    client[m] = (url, opts = {}) => request(Object.assign(own(opts), { method: m.toUpperCase(), url }));
  }
  return Object.freeze(client);
}

/** Wrap a body stream so `onDone` runs exactly once when it ends, errors or is cancelled. */
function guardStream(source, onDone) {
  const reader = source.getReader();
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      onDone();
    }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          finish();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        finish();
        controller.error(err);
      }
    },
    async cancel(reason) {
      finish();
      await reader.cancel(reason);
    },
  });
}

/**
 * Response whose body is a web ReadableStream. The size limit and the
 * request deadline still apply while it is read. Read it once: either
 * iterate `body`, or call `bytes()` / `text()` / `json()`.
 */
class HttpStreamResponse {
  #maxResponseBytes;
  constructor({ status, statusText, headers, body, url, redirected, maxResponseBytes }) {
    this.status = status;
    this.statusText = statusText;
    this.headers = new Headers(headers);
    this.url = url;
    this.redirected = redirected;
    this.body = body;
    this.#maxResponseBytes = maxResponseBytes;
    Object.freeze(this);
  }
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
  bytes() {
    return collectBytes(this.body, { maxBytes: this.#maxResponseBytes });
  }
  async text() {
    return new TextDecoder().decode(await this.bytes());
  }
  async json(options = {}) {
    const bytes = await this.bytes();
    return parseJson(bytes, { maxBytes: Math.max(1, bytes.byteLength), maxDepth: options.maxDepth ?? 64, schema: options.schema });
  }
  cancel(reason) {
    return this.body.cancel(reason);
  }
}

export { HttpResponse, HttpStreamResponse };
