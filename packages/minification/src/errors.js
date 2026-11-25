import { AmetherianError } from '@foulfoxhacks/ametherian-core';

export class MinificationError extends AmetherianError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code ?? 'AMETHERIAN_MINIFICATION_FAILED',
      retryable: false,
      ...(options.cause === undefined ? {} : { cause: options.cause }),
      details: options.details ?? {},
    });
  }
}
