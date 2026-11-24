export declare const ErrorCodes: Readonly<{
  GENERIC: 'AMETHERIAN_ERROR';
  ABORTED: 'AMETHERIAN_ABORTED';
  TIMEOUT: 'AMETHERIAN_TIMEOUT';
  LIMIT_EXCEEDED: 'AMETHERIAN_LIMIT_EXCEEDED';
  CONFIG: 'AMETHERIAN_CONFIG';
  UNSUPPORTED: 'AMETHERIAN_UNSUPPORTED';
}>;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface AmetherianErrorOptions {
  code?: string;
  cause?: unknown;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export declare class AmetherianError extends Error {
  constructor(message: string, options?: AmetherianErrorOptions);
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>>;
  toJSON(): { name: string; code: string; message: string; retryable: boolean; details: Readonly<Record<string, unknown>> };
}
export declare class AbortError extends AmetherianError {
  constructor(message?: string, options?: Omit<AmetherianErrorOptions, 'code' | 'retryable'>);
}
export declare class TimeoutError extends AmetherianError {
  constructor(message?: string, options?: Omit<AmetherianErrorOptions, 'code'>);
}
export declare class LimitExceededError extends AmetherianError {
  constructor(message: string, info: { limit: number; actual?: number; resource?: string; cause?: unknown });
}
export declare class ConfigError extends AmetherianError {
  constructor(message: string, info?: { problems?: string[]; cause?: unknown });
}
export declare class UnsupportedCapabilityError extends AmetherianError {
  constructor(capability: string, message?: string);
}
export declare function isAmetherianError(value: unknown): value is AmetherianError;

export declare function toAbortError(reason: unknown): AmetherianError;
export declare function throwIfAborted(signal: AbortSignal | undefined): void;
export interface Deadline {
  readonly signal: AbortSignal;
  dispose(): void;
  readonly expiresAt: number;
}
export declare function createDeadline(ms: number, options?: { signal?: AbortSignal }): Deadline;
export declare function abortable<T>(work: Promise<T> | (() => Promise<T>), signal: AbortSignal | undefined): Promise<T>;

export declare function assertWithinLimit(actual: number, limit: number, resource?: string): void;
export declare function createByteLimitStream(
  maxBytes: number,
  options?: { resource?: string },
): TransformStream<string | ArrayBuffer | ArrayBufferView, string | ArrayBuffer | ArrayBufferView>;
export declare function collectBytes(
  source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
  options: { maxBytes: number; signal?: AbortSignal; resource?: string },
): Promise<Uint8Array>;
