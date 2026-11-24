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

export declare const REDACTED: '[REDACTED]';
export declare const DEFAULT_SENSITIVE_HEADERS: readonly string[];
export declare const DEFAULT_SENSITIVE_QUERY_PARAMS: readonly string[];
export interface RedactOptions {
  extra?: string[];
  replacement?: string;
}
export declare function redactHeaders(
  headers: Headers | Array<[string, string]> | Record<string, string | string[] | undefined>,
  options?: RedactOptions,
): Record<string, string | string[] | undefined>;
export declare function redactUrl(url: string | URL, options?: RedactOptions): string;

export interface RuntimeCapabilities {
  runtime: 'node' | 'deno' | 'bun' | 'unknown';
  version: string | null;
  fetch: boolean;
  webStreams: boolean;
  abortSignalAny: boolean;
  abortSignalTimeout: boolean;
  webCrypto: boolean;
  structuredClone: boolean;
}
export type CapabilityName = Exclude<keyof RuntimeCapabilities, 'runtime' | 'version'>;
export declare function getRuntimeCapabilities(globalObject?: object): Readonly<RuntimeCapabilities>;
export declare function requireCapability(...names: CapabilityName[]): void;

export type OptionType = 'string' | 'number' | 'integer' | 'boolean' | 'function' | 'object' | 'array' | 'signal';
export interface OptionSpec {
  type: OptionType;
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  oneOf?: readonly unknown[];
  validate?: (value: any) => string | undefined;
}
export declare function validateOptions<S extends Record<string, OptionSpec>>(
  options: Record<string, unknown> | undefined | null,
  schema: S,
  settings?: { name?: string; allowUnknown?: boolean },
): Readonly<{ [K in keyof S]: any }>;

export declare const asyncDispose: typeof Symbol.asyncDispose;
export declare const dispose: typeof Symbol.dispose;
export declare const CLEANUP_FAILED: 'AMETHERIAN_CLEANUP_FAILED';
export interface ResourceScope {
  readonly closed: boolean;
  defer(fn: () => unknown): void;
  use<T extends object>(resource: T): T;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}
export declare function createResourceScope(): ResourceScope;

export interface EventHub {
  on(name: string, fn: (payload: any) => unknown): () => void;
  onAny(fn: (name: string, payload: any) => unknown): () => void;
  hasListeners(name: string): boolean;
  emit(name: string, payload?: Record<string, unknown>): void;
}
export declare function createEventHub(options?: { onListenerError?: (error: unknown, event: string) => void }): EventHub;
