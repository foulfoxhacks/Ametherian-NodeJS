import { AmetherianError } from '@foulfoxhacks/ametherian-core';

export const HTTP_STATUS = 'AMETHERIAN_HTTP_STATUS';
export const NETWORK = 'AMETHERIAN_NETWORK';
export const TOO_MANY_REDIRECTS = 'AMETHERIAN_TOO_MANY_REDIRECTS';
export const BASE_URL_ESCAPE = 'AMETHERIAN_BASE_URL_ESCAPE';
/** A 307/308 redirect would have to resend a streamed (single-use) request body. */
export const STREAM_BODY_REDIRECT = 'AMETHERIAN_STREAM_BODY_REDIRECT';

/** Status codes that are safe to retry (for idempotent methods). */
export const RETRYABLE_STATUS = Object.freeze([408, 425, 429, 500, 502, 503, 504]);

/**
 * Parse a Retry-After header (seconds or HTTP date) into milliseconds.
 * @param {string | null | undefined} value
 * @param {() => number} [now]
 */
export function parseRetryAfter(value, now = Date.now) {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now());
}

/** Non-2xx response when `throwOnStatus` is on. Carries the response. */
export class HttpStatusError extends AmetherianError {
  constructor(response, method) {
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    super(`${method} ${response.url} responded ${response.status}`, {
      code: HTTP_STATUS,
      retryable: RETRYABLE_STATUS.includes(response.status),
      details: { status: response.status, method, url: response.url, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) },
    });
    Object.defineProperty(this, 'response', { value: response, enumerable: false });
  }
}

/** Connection-level failure (reset, refused, DNS). Retryable. */
export class NetworkError extends AmetherianError {
  constructor(message, cause, details = {}) {
    super(message, { code: NETWORK, retryable: true, cause, details: { syscallCode: cause?.code, ...details } });
  }
}
