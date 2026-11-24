/**
 * Typed errors shared by Ametherian packages.
 *
 * Every error carries a stable `code` string so callers can branch on it
 * without parsing messages, a `retryable` flag, and optional structured
 * `details`. Messages may change between versions; codes may not.
 */

export const ErrorCodes = Object.freeze({
  GENERIC: 'AMETHERIAN_ERROR',
  ABORTED: 'AMETHERIAN_ABORTED',
  TIMEOUT: 'AMETHERIAN_TIMEOUT',
  LIMIT_EXCEEDED: 'AMETHERIAN_LIMIT_EXCEEDED',
  CONFIG: 'AMETHERIAN_CONFIG',
  UNSUPPORTED: 'AMETHERIAN_UNSUPPORTED',
});

const BRAND = Symbol.for('ametherian.error');

export class AmetherianError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown, retryable?: boolean, details?: Record<string, unknown> }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? ErrorCodes.GENERIC;
    this.retryable = options.retryable ?? false;
    this.details = Object.freeze({ ...(options.details ?? {}) });
    Object.defineProperty(this, BRAND, { value: true });
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

/** Operation was cancelled by its caller. Not retryable. */
export class AbortError extends AmetherianError {
  constructor(message = 'The operation was aborted', options = {}) {
    super(message, { ...options, code: ErrorCodes.ABORTED, retryable: false });
  }
}

/** A deadline elapsed. Retryable by default, since the cause is usually transient. */
export class TimeoutError extends AmetherianError {
  constructor(message = 'The operation timed out', options = {}) {
    super(message, { retryable: true, ...options, code: ErrorCodes.TIMEOUT });
  }
}

/** A configured resource bound was exceeded. */
export class LimitExceededError extends AmetherianError {
  /**
   * @param {string} message
   * @param {{ limit: number, actual?: number, resource?: string, cause?: unknown }} info
   */
  constructor(message, info) {
    super(message, {
      code: ErrorCodes.LIMIT_EXCEEDED,
      retryable: false,
      cause: info?.cause,
      details: { resource: info?.resource, limit: info?.limit, actual: info?.actual },
    });
  }
}

/** Invalid options were supplied. `problems` lists every issue found. */
export class ConfigError extends AmetherianError {
  /**
   * @param {string} message
   * @param {{ problems?: string[], cause?: unknown }} [info]
   */
  constructor(message, info = {}) {
    super(message, {
      code: ErrorCodes.CONFIG,
      retryable: false,
      cause: info.cause,
      details: { problems: Object.freeze([...(info.problems ?? [])]) },
    });
  }
}

/** The current runtime lacks a capability the caller needs. Never silently falls back. */
export class UnsupportedCapabilityError extends AmetherianError {
  /** @param {string} capability */
  constructor(capability, message = `Runtime capability not available: ${capability}`) {
    super(message, { code: ErrorCodes.UNSUPPORTED, retryable: false, details: { capability } });
  }
}

/**
 * True for any Ametherian error, including ones created by a different copy
 * of this package (brand check instead of instanceof).
 * @param {unknown} value
 * @returns {value is AmetherianError}
 */
export function isAmetherianError(value) {
  return typeof value === 'object' && value !== null && value[BRAND] === true;
}
