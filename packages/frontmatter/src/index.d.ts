import type { AmetherianError } from '@foulfoxhacks/ametherian-core';

export declare const YAML_INVALID: 'AMETHERIAN_YAML_INVALID';
export declare class YamlError extends AmetherianError {
  constructor(message: string, line?: number);
  readonly details: Readonly<{ line: number | null }>;
}
export type YamlValue = string | number | boolean | null | Date | YamlValue[] | { [key: string]: YamlValue };
export interface YamlOptions {
  maxBytes?: number;
  maxDepth?: number;
  maxKeys?: number;
  /** 'string' (default) keeps ISO dates as strings; 'date' returns Date objects like gray-matter. */
  dates?: 'string' | 'date';
}
export declare function parseYaml(source: string, options?: YamlOptions): { [key: string]: YamlValue } | YamlValue[];
export declare function stringifyYaml(data: Record<string, unknown>): string;

export interface MatterOptions extends YamlOptions {
  excerpt?: boolean;
  excerptSeparator?: string;
}
export interface MatterResult<T = Record<string, YamlValue>> {
  readonly data: T;
  readonly content: string;
  readonly matter: string;
  readonly isEmpty: boolean;
  readonly excerpt?: string;
}
export declare function matter<T = Record<string, YamlValue>>(input: string | Uint8Array, options?: MatterOptions): MatterResult<T>;
export declare function stringify(content: string, data: Record<string, unknown>): string;
export declare function test(text: string): boolean;
export default matter;
