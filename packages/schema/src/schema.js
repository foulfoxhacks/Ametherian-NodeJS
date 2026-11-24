/**
 * Composable validators for untrusted input.
 *
 * Every schema has `parse(value)` (returns a cleaned copy or throws
 * SchemaError with all issues) and `safeParse(value)` ({ ok, value | issues }).
 * Objects are rebuilt from known keys only, so prototype-polluting keys and
 * unknown fields never reach the caller unless explicitly allowed.
 */
import { AmetherianError } from '@foulfoxhacks/ametherian-core';

export const SCHEMA_INVALID = 'AMETHERIAN_SCHEMA_INVALID';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class SchemaError extends AmetherianError {
  /** @param {Array<{ path: (string|number)[], message: string }>} issues */
  constructor(issues) {
    const first = issues[0];
    const where = first && first.path.length ? first.path.join('.') : '(root)';
    super(`Invalid input at ${where}: ${first?.message ?? 'unknown error'}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`, {
      code: SCHEMA_INVALID,
      retryable: false,
      details: { issues: Object.freeze(issues.map((i) => Object.freeze({ path: Object.freeze([...i.path]), message: i.message }))) },
    });
  }
}

function describe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  return typeof v;
}

/**
 * Wrap a check function `(value, path, issues) => output`.
 * Checks push issues and return the cleaned value (ignored if issues grew).
 */
function makeSchema(check, meta = {}) {
  const schema = {
    _check: check,
    _optional: meta.optional ?? false,
    parse(value) {
      const issues = [];
      const out = check(value, [], issues);
      if (issues.length) throw new SchemaError(issues);
      return out;
    },
    safeParse(value) {
      const issues = [];
      const out = check(value, [], issues);
      return issues.length ? { ok: false, issues } : { ok: true, value: out };
    },
    optional() {
      return makeSchema((v, p, i) => (v === undefined ? undefined : check(v, p, i)), { optional: true });
    },
    nullable() {
      return makeSchema((v, p, i) => (v === null ? null : check(v, p, i)), meta);
    },
    default(value) {
      return makeSchema((v, p, i) => check(v === undefined ? (typeof value === 'function' ? value() : value) : v, p, i), {
        optional: true,
      });
    },
    refine(fn, message = 'failed refinement') {
      return makeSchema((v, p, i) => {
        const before = i.length;
        const out = check(v, p, i);
        if (i.length === before && !fn(out)) i.push({ path: p, message });
        return out;
      }, meta);
    },
    transform(fn) {
      return makeSchema((v, p, i) => {
        const before = i.length;
        const out = check(v, p, i);
        return i.length === before ? fn(out) : out;
      }, meta);
    },
  };
  return Object.freeze(schema);
}

function lengthChecks(len, opts, path, issues, unit) {
  if (opts.min !== undefined && len < opts.min) issues.push({ path, message: `must have at least ${opts.min} ${unit}` });
  if (opts.max !== undefined && len > opts.max) issues.push({ path, message: `must have at most ${opts.max} ${unit}` });
}

/**
 * @param {{ min?: number, max?: number, pattern?: RegExp, trim?: boolean }} [opts]
 */
export function string(opts = {}) {
  return makeSchema((v, path, issues) => {
    if (typeof v !== 'string') {
      issues.push({ path, message: `expected string, got ${describe(v)}` });
      return v;
    }
    const s = opts.trim ? v.trim() : v;
    lengthChecks(s.length, opts, path, issues, 'characters');
    if (opts.pattern && !opts.pattern.test(s)) issues.push({ path, message: 'does not match required pattern' });
    return s;
  });
}

/**
 * Finite numbers only (no NaN/Infinity).
 * @param {{ min?: number, max?: number, integer?: boolean }} [opts]
 */
export function number(opts = {}) {
  return makeSchema((v, path, issues) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      issues.push({ path, message: `expected finite number, got ${describe(v)}` });
      return v;
    }
    if (opts.integer && !Number.isInteger(v)) issues.push({ path, message: 'expected integer' });
    if (opts.min !== undefined && v < opts.min) issues.push({ path, message: `must be >= ${opts.min}` });
    if (opts.max !== undefined && v > opts.max) issues.push({ path, message: `must be <= ${opts.max}` });
    return v;
  });
}

export function boolean() {
  return makeSchema((v, path, issues) => {
    if (typeof v !== 'boolean') issues.push({ path, message: `expected boolean, got ${describe(v)}` });
    return v;
  });
}

/** @param {...(string|number|boolean|null)} values */
export function literal(...values) {
  return makeSchema((v, path, issues) => {
    if (!values.includes(v)) issues.push({ path, message: `expected one of ${values.map((x) => JSON.stringify(x)).join(', ')}` });
    return v;
  });
}

/**
 * @param {ReturnType<typeof makeSchema>} item
 * @param {{ min?: number, max?: number }} [opts]
 */
export function array(item, opts = {}) {
  return makeSchema((v, path, issues) => {
    if (!Array.isArray(v)) {
      issues.push({ path, message: `expected array, got ${describe(v)}` });
      return v;
    }
    lengthChecks(v.length, opts, path, issues, 'items');
    if (opts.max !== undefined && v.length > opts.max) return v; // do not walk oversized input
    return v.map((x, idx) => item._check(x, [...path, idx], issues));
  });
}

/**
 * @param {Record<string, ReturnType<typeof makeSchema>>} shape
 * @param {{ unknownKeys?: 'reject' | 'strip' }} [opts] default 'reject'
 */
export function object(shape, opts = {}) {
  const mode = opts.unknownKeys ?? 'reject';
  const keys = Object.keys(shape);
  return makeSchema((v, path, issues) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      issues.push({ path, message: `expected object, got ${describe(v)}` });
      return v;
    }
    const out = {};
    for (const key of keys) {
      const present = Object.hasOwn(v, key);
      const value = present ? v[key] : undefined;
      if (!present && !shape[key]._optional) {
        issues.push({ path: [...path, key], message: 'required' });
        continue;
      }
      const parsed = shape[key]._check(value, [...path, key], issues);
      if (parsed !== undefined) out[key] = parsed;
    }
    if (mode === 'reject') {
      for (const key of Object.keys(v)) {
        if (!Object.hasOwn(shape, key)) issues.push({ path: [...path, key], message: 'unknown key' });
      }
    }
    return out;
  });
}

/**
 * String-keyed map with validated values. Dangerous keys are always rejected.
 * Returns a null-prototype object.
 * @param {ReturnType<typeof makeSchema>} value
 * @param {{ maxKeys?: number, key?: ReturnType<typeof makeSchema> }} [opts]
 */
export function record(value, opts = {}) {
  return makeSchema((v, path, issues) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      issues.push({ path, message: `expected object, got ${describe(v)}` });
      return v;
    }
    const entries = Object.keys(v);
    if (opts.maxKeys !== undefined && entries.length > opts.maxKeys) {
      issues.push({ path, message: `must have at most ${opts.maxKeys} keys` });
      return v;
    }
    const out = Object.create(null);
    for (const k of entries) {
      if (FORBIDDEN_KEYS.has(k)) {
        issues.push({ path: [...path, k], message: 'forbidden key' });
        continue;
      }
      if (opts.key) opts.key._check(k, [...path, k], issues);
      out[k] = value._check(v[k], [...path, k], issues);
    }
    return out;
  });
}

/**
 * First matching schema wins. Reports issues from every option if none match.
 * @param {...ReturnType<typeof makeSchema>} options
 */
export function union(...options) {
  return makeSchema((v, path, issues) => {
    const collected = [];
    for (const opt of options) {
      const local = [];
      const out = opt._check(v, path, local);
      if (local.length === 0) return out;
      collected.push(...local);
    }
    issues.push({ path, message: `did not match any allowed shape (${collected.map((i) => i.message).join(' | ')})` });
    return v;
  });
}

/** Accept any value unchanged (no copy, no checks). Use sparingly. */
export function unknown() {
  return makeSchema((v) => v, { optional: true });
}

