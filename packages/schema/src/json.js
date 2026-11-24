/**
 * Bounded JSON parsing for untrusted text: size and nesting depth are
 * checked before JSON.parse runs, so oversized or deeply nested payloads
 * are refused without allocating the whole tree or overflowing the stack.
 */
import { LimitExceededError, ConfigError } from '@foulfoxhacks/ametherian-core';
import { SchemaError } from './schema.js';

/**
 * Maximum bracket nesting depth of JSON text, ignoring brackets in strings.
 * @param {string} text
 */
export function jsonDepth(text) {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 92 /* \ */) i++;
      else if (c === 34 /* " */) inString = false;
      continue;
    }
    if (c === 34) inString = true;
    else if (c === 123 || c === 91) {
      depth++;
      if (depth > max) max = depth;
    } else if (c === 125 || c === 93) depth--;
  }
  return max;
}

/**
 * Parse JSON text with limits, then (optionally) validate with a schema.
 * Keys "__proto__", "constructor" and "prototype" are dropped during parsing.
 *
 * @param {string | Uint8Array} input
 * @param {{ maxBytes?: number, maxDepth?: number, schema?: { parse(v: unknown): any } }} [options]
 */
export function parseJson(input, options = {}) {
  const maxBytes = options.maxBytes ?? 1_000_000;
  const maxDepth = options.maxDepth ?? 64;
  for (const [name, v] of [['maxBytes', maxBytes], ['maxDepth', maxDepth]]) {
    if (!Number.isInteger(v) || v < 1) throw new ConfigError(`${name} must be a positive integer`, { problems: [`${name}: ${v}`] });
  }
  const size = typeof input === 'string' ? Buffer.byteLength(input) : input?.byteLength;
  if (typeof size !== 'number') throw new TypeError('parseJson expects a string or Uint8Array');
  if (size > maxBytes) {
    throw new LimitExceededError(`JSON exceeds ${maxBytes} bytes`, { limit: maxBytes, actual: size, resource: 'json' });
  }
  let text;
  if (typeof input === 'string') text = input;
  else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      throw new SchemaError([{ path: [], message: 'invalid UTF-8' }]);
    }
  }
  const depth = jsonDepth(text);
  if (depth > maxDepth) {
    throw new LimitExceededError(`JSON nesting exceeds ${maxDepth}`, { limit: maxDepth, actual: depth, resource: 'json-depth' });
  }
  let value;
  try {
    value = JSON.parse(text, (key, v) => (key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : v));
  } catch (err) {
    throw new SchemaError([{ path: [], message: `invalid JSON: ${err.message}` }]);
  }
  return options.schema ? options.schema.parse(value) : value;
}
