import type { AmetherianError } from '@foulfoxhacks/ametherian-core';

export interface Issue { readonly path: readonly (string | number)[]; readonly message: string }
export type SafeParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
  optional(): Schema<T | undefined>;
  nullable(): Schema<T | null>;
  default(value: T | (() => T)): Schema<T>;
  refine(fn: (value: T) => boolean, message?: string): Schema<T>;
  transform<U>(fn: (value: T) => U): Schema<U>;
}
export type Infer<S> = S extends Schema<infer T> ? T : never;

export declare const SCHEMA_INVALID: 'AMETHERIAN_SCHEMA_INVALID';
export declare class SchemaError extends AmetherianError {
  constructor(issues: Issue[]);
  readonly details: Readonly<{ issues: readonly Issue[] }>;
}

export declare function string(opts?: { min?: number; max?: number; pattern?: RegExp; trim?: boolean }): Schema<string>;
export declare function number(opts?: { min?: number; max?: number; integer?: boolean }): Schema<number>;
export declare function boolean(): Schema<boolean>;
export declare function literal<const T extends (string | number | boolean | null)[]>(...values: T): Schema<T[number]>;
export declare function array<T>(item: Schema<T>, opts?: { min?: number; max?: number }): Schema<T[]>;
export declare function object<S extends Record<string, Schema<any>>>(
  shape: S,
  opts?: { unknownKeys?: 'reject' | 'strip' },
): Schema<{ [K in keyof S]: Infer<S[K]> }>;
export declare function record<T>(value: Schema<T>, opts?: { maxKeys?: number; key?: Schema<string> }): Schema<Record<string, T>>;
export declare function union<S extends Schema<any>[]>(...options: S): Schema<Infer<S[number]>>;
export declare function unknown(): Schema<unknown>;

export declare function jsonDepth(text: string): number;
export declare function parseJson<T = unknown>(
  input: string | Uint8Array,
  options?: { maxBytes?: number; maxDepth?: number; schema?: { parse(v: unknown): T } },
): T;
