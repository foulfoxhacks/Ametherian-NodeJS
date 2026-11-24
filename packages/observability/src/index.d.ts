export declare const LEVELS: Readonly<{ trace: 10; debug: 20; info: 30; warn: 40; error: 50; silent: 100 }>;
export type Level = keyof typeof LEVELS;
export interface LogRecord { time: string; level: Exclude<Level, 'silent'>; msg: string; [field: string]: unknown }
export interface LoggerOptions {
  level?: Level;
  sink?: (record: LogRecord) => void;
  fields?: Record<string, unknown>;
  redactKeys?: string[];
  includeStack?: boolean;
  now?: () => Date;
}
export interface Logger {
  readonly level: Level;
  isEnabled(level: Level): boolean;
  child(fields: Record<string, unknown>): Logger;
  trace(msg: string, fields?: unknown): void;
  debug(msg: string, fields?: unknown): void;
  info(msg: string, fields?: unknown): void;
  warn(msg: string, fields?: unknown): void;
  error(msg: string, fields?: unknown): void;
}
export declare function createLogger(options?: LoggerOptions): Logger;
export declare function sanitize(value: unknown, options?: { redactKeys?: string[]; includeStack?: boolean }): unknown;
export declare function serializeError(error: unknown, includeStack?: boolean): Record<string, unknown>;

export declare const OVERFLOW_LABEL: '__overflow__';
export declare const DEFAULT_BUCKETS: readonly number[];
export type Labels = Record<string, string | number | boolean>;
export interface Metrics {
  counter(name: string, help?: string): { inc(labels?: Labels, by?: number): void };
  gauge(name: string, help?: string): { set(labels: Labels, value: number): void; add(labels?: Labels, by?: number): void };
  histogram(name: string, help?: string, buckets?: readonly number[]): { observe(labels: Labels, value: number): void };
  snapshot(): Record<string, unknown>;
  toPrometheus(): string;
}
export declare function createMetrics(options?: { maxSeries?: number }): Metrics;

export declare function attachEventHub(
  hub: { onAny(fn: (name: string, payload: any) => unknown): () => void },
  targets?: { logger?: Logger; metrics?: Metrics },
): () => void;
export declare function publishToDiagnosticsChannel(
  hub: { onAny(fn: (name: string, payload: any) => unknown): () => void },
  prefix?: string,
): () => void;
