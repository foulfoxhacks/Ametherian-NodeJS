import type { AmetherianError } from '@foulfoxhacks/ametherian-core';
export type MinificationLevel = 'conservative' | 'standard';
export interface MinificationStats {
  readonly inputBytes: number; readonly outputBytes: number; readonly savedBytes: number;
  readonly reductionPercent: number; readonly durationMs: number;
}
export interface MinificationResult {
  readonly type: 'javascript' | 'cascade'; readonly code: string; readonly map: string | null;
  readonly warnings: readonly unknown[]; readonly engine: string; readonly stats: MinificationStats;
}
export declare class MinificationError extends AmetherianError {
  readonly code: string; readonly retryable: false; readonly details?: Readonly<Record<string, unknown>>;
}
export declare const DEFAULT_LIMITS: Readonly<{ maxInputBytes: number; maxOutputBytes: number; maxSourceMapBytes: number }>;
export declare function createJavaScriptMinifier(options: { transform: (source: string, options: Record<string, unknown>) => Promise<{ code: string; map?: string | null; warnings?: unknown[] }> }): (source: string, options?: { level?: MinificationLevel; target?: 'es2020' | 'es2021' | 'es2022' | 'es2023' | 'esnext'; sourceMap?: boolean }) => Promise<{ code: string; map: unknown; warnings: unknown[]; engine: string }>;
export declare function createCascadeMinifier(options: { transform: (options: Record<string, unknown>) => Promise<{ code: string | Uint8Array; map?: unknown; warnings?: unknown[] }> }): (source: string, options?: { filename?: string; sourceMap?: boolean; targets?: Record<string, number> }) => Promise<{ code: string | Uint8Array; map: unknown; warnings: unknown[]; engine: string }>;
export declare function createMinificationEngine(options: {
  javascript: (source: string, options?: Record<string, unknown>) => Promise<{ code: string | Uint8Array; map?: unknown; warnings?: unknown[]; engine?: string }>;
  cascade: (source: string, options?: Record<string, unknown>) => Promise<{ code: string | Uint8Array; map?: unknown; warnings?: unknown[]; engine?: string }>;
  limits?: { maxInputBytes?: number; maxOutputBytes?: number; maxSourceMapBytes?: number };
}): {
  readonly limits: Readonly<{ maxInputBytes: number; maxOutputBytes: number; maxSourceMapBytes: number }>;
  minifyJavaScript(source: string, options?: Record<string, unknown>): Promise<MinificationResult>;
  minifyCascade(source: string, options?: Record<string, unknown>): Promise<MinificationResult>;
  minify(type: 'javascript' | 'cascade', source: string, options?: Record<string, unknown>): Promise<MinificationResult>;
};
