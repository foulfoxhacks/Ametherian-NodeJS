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
  throwIfAborted,
  redactUrl,
  ConfigError,
  isAmetherianError,
  AmetherianError,
} from '@foulfoxhacks/ametherian-core';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { retry } from '@foulfoxhacks/ametherian-resilience';
import { parseJson } from '@foulfoxhacks/ametherian-schema';
import { createNodeTransport } from './transport.js';
import { HttpStatusError, TOO_MANY_REDIRECTS } from './errors.js';

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
  userAgent: { type: 'string', default: 'ametherian-http/0.0.0' },
};

const REQUEST_SCHEMA = {
  method: { type: 'string', default: 'GET', validate: (m) => (/^[A-Z]+$/.test(m) ? undefined : 'must be an upper-case token') },
  url: { type: 'string', required: true },
  headers: { type: 'object', default: {} },
  signal: { type: 'signal' },
  timeoutMs: { type: 'integer', min: 1 },
  maxResponseBytes: { type: 'integer', min: 0 },
  throwOnStatus: { type: 'boolean' },
};

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
      if (/[\r\n]/.test(String(k)) || /[\r\n]/.test(String(v))) {
        throw new ConfigError('Header names and values must not contain CR or LF', { problems: [`headers.${k}: contains CR/LF`] });
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
  const { retry: clientRetry, ...clientRest } = options ?? {};
  const o = validateOptions(clientRest, CLIENT_SCHEMA, { name: 'http client options' });
  const defaultRetry = checkRetryOption(clientRetry, 'http client options') ?? {};
  const policy = o.policy ?? createDestinationPolicy();
  for (const fn of ['checkUrl', 'checkRedirect', 'lookup']) {
    if (typeof policy[fn] !== 'function') throw new ConfigError('policy must come from createDestinationPolicy', { problems: [`policy.${fn}: missing`] });
  }
  const transport = o.transport ?? createNodeTransport({ lookup: policy.lookup });
  const hooks = o.hooks;
  const emit = (name, payload) => {
    if (hooks?.hasListeners?.(name)) hooks.emit(name, payload);
  };
  const defaultHeaders = lowerHeaders({ 'user-agent': o.userAgent, 'accept-encoding': 'gzip, deflate, br' }, o.headers);

  async function attempt(req, signal) {
    let url = policy.checkUrl(req.url, o.baseUrl);
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
      const raw = await transport({ method, url, headers, body, signal, maxResponseBytes: req.maxResponseBytes, lookup: policy.lookup });
      emit('http.response', { method, url: redactUrl(url), status: raw.status, durationMs: performance.now() - started });

      const location = raw.headers.find(([k]) => k.toLowerCase() === 'location')?.[1];
      if (REDIRECT_STATUS.has(raw.status) && location !== undefined) {
        if (hop >= o.maxRedirects) {
          throw new AmetherianError(`Too many redirects (max ${o.maxRedirects})`, {
            code: TOO_MANY_REDIRECTS,
            details: { maxRedirects: o.maxRedirects, url: redactUrl(url) },
          });
        }
        const next = policy.checkRedirect(url, location);
        if (next.origin !== url.origin) {
          for (const h of CREDENTIAL_HEADERS) delete headers[h];
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
    const { json, body: rawBody, retry: retryOverride, ...rest } = input ?? {};
    const r = validateOptions(rest, REQUEST_SCHEMA, { name: 'request options' });
    let body = toBytes(rawBody);
    const extraHeaders = {};
    if (json !== undefined) {
      if (rawBody !== undefined) throw new ConfigError('Use either body or json, not both', { problems: ['body/json: both set'] });
      body = new TextEncoder().encode(JSON.stringify(json));
      extraHeaders['content-type'] = 'application/json';
      extraHeaders.accept = 'application/json';
    }
    const req = {
      method: r.method,
      url: r.url,
      headers: lowerHeaders(defaultHeaders, extraHeaders, r.headers),
      body,
      maxResponseBytes: r.maxResponseBytes ?? o.maxResponseBytes,
      throwOnStatus: r.throwOnStatus ?? o.throwOnStatus,
    };
    const timeoutMs = r.timeoutMs ?? o.timeoutMs;
    const override = checkRetryOption(retryOverride, 'request options');
    const retryConfig = override === undefined ? defaultRetry : override;
    const canRetry = retryConfig && IDEMPOTENT.has(req.method);

    const once = async () => {
      const deadline = createDeadline(timeoutMs, { signal: r.signal });
      try {
        return await attempt(req, deadline.signal);
      } catch (err) {
        emit('http.error', { method: req.method, url: redactUrl(r.url), error: err });
        throw err;
      } finally {
        deadline.dispose();
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
  for (const m of ['get', 'head', 'delete', 'options']) {
    client[m] = (url, opts = {}) => request({ ...opts, method: m.toUpperCase(), url });
  }
  for (const m of ['post', 'put', 'patch']) {
    client[m] = (url, opts = {}) => request({ ...opts, method: m.toUpperCase(), url });
  }
  return Object.freeze(client);
}

export { HttpResponse };
