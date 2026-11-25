export class MinificationError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'MinificationError';
    this.code = options.code ?? 'AMETHERIAN_MINIFICATION_FAILED';
    this.retryable = false;
    if (options.details) this.details = Object.freeze({ ...options.details });
  }
}
