export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: 'full' | 'none';
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  signal?: AbortSignal;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
export declare function retry<T>(fn: (ctx: { attempt: number; signal?: AbortSignal }) => Promise<T>, options?: RetryOptions): Promise<T>;
export declare function backoffDelay(
  attempt: number,
  options: { minDelayMs: number; maxDelayMs: number; factor: number; jitter: 'full' | 'none' },
  random?: () => number,
): number;
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;

export interface ConcurrencyLimit {
  run<T>(fn: () => T | Promise<T>, options?: { signal?: AbortSignal }): Promise<T>;
  readonly active: number;
  readonly pending: number;
}
export declare function createConcurrencyLimit(options: { maxConcurrent: number; maxQueue?: number }): ConcurrencyLimit;

export interface RateLimiter {
  tryRemove(n?: number): boolean;
  msUntilAvailable(n?: number): number;
  readonly tokens: number;
}
export declare function createRateLimiter(options: { capacity: number; refillPerSecond: number; now?: () => number }): RateLimiter;

export declare const CIRCUIT_OPEN: 'AMETHERIAN_CIRCUIT_OPEN';
export interface CircuitBreaker {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly state: 'closed' | 'open' | 'half-open';
  reset(): void;
}
export declare function createCircuitBreaker(options?: {
  failureThreshold?: number;
  resetMs?: number;
  now?: () => number;
  isFailure?: (error: unknown) => boolean;
}): CircuitBreaker;
