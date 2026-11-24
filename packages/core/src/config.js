/**
 * Small options validator. Collects every problem before throwing, so
 * callers see all mistakes at once in ConfigError.details.problems.
 *
 * Descriptor per key:
 *   type      'string' | 'number' | 'integer' | 'boolean' | 'function' | 'object' | 'array' | 'signal'
 *   required  boolean (default false)
 *   default   value used when the key is missing or undefined
 *   min, max  bounds for numbers/integers, or length for strings/arrays
 *   oneOf     array of allowed values
 *   validate  (value) => string | undefined   custom check, returns a problem message
 */
import { ConfigError } from './errors.js';

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && !Number.isNaN(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  function: (v) => typeof v === 'function',
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  signal: (v) => typeof AbortSignal !== 'undefined' && v instanceof AbortSignal,
};

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return typeof value;
}

/**
 * Validate `options` against `schema` and return a new frozen object with
 * defaults applied. Unknown keys are rejected unless `allowUnknown` is set.
 * Only own enumerable keys are read, so inherited/prototype keys are ignored.
 *
 * @template {Record<string, object>} S
 * @param {Record<string, unknown> | undefined | null} options
 * @param {S} schema
 * @param {{ name?: string, allowUnknown?: boolean }} [settings]
 * @returns {Readonly<Record<keyof S, any>>}
 */
export function validateOptions(options, schema, settings = {}) {
  const name = settings.name ?? 'options';
  for (const [key, spec] of Object.entries(schema)) {
    if (!spec || !TYPE_CHECKS[spec.type]) {
      throw new TypeError(`Invalid schema for "${key}": unknown type ${String(spec?.type)}`);
    }
  }
  const problems = [];
  if (options !== undefined && options !== null && !TYPE_CHECKS.object(options)) {
    throw new ConfigError(`${name} must be an object`, { problems: [`${name}: expected object, got ${describe(options)}`] });
  }
  const input = options ?? {};
  const out = Object.create(null);

  if (!settings.allowUnknown) {
    for (const key of Object.keys(input)) {
      if (!Object.hasOwn(schema, key)) problems.push(`${key}: unknown option`);
    }
  }

  for (const [key, spec] of Object.entries(schema)) {
    let value = Object.hasOwn(input, key) ? input[key] : undefined;
    if (value === undefined && 'default' in spec) value = spec.default;
    if (value === undefined) {
      if (spec.required) problems.push(`${key}: required`);
      continue;
    }
    if (!TYPE_CHECKS[spec.type](value)) {
      problems.push(`${key}: expected ${spec.type}, got ${describe(value)}`);
      continue;
    }
    const measured =
      spec.type === 'number' || spec.type === 'integer'
        ? value
        : spec.type === 'string' || spec.type === 'array'
          ? value.length
          : undefined;
    const unit = spec.type === 'string' || spec.type === 'array' ? ' (length)' : '';
    if (measured !== undefined && spec.min !== undefined && measured < spec.min) {
      problems.push(`${key}: must be >= ${spec.min}${unit}, got ${measured}`);
    }
    if (measured !== undefined && spec.max !== undefined && measured > spec.max) {
      problems.push(`${key}: must be <= ${spec.max}${unit}, got ${measured}`);
    }
    if (spec.oneOf && !spec.oneOf.includes(value)) {
      problems.push(`${key}: must be one of ${spec.oneOf.map((v) => JSON.stringify(v)).join(', ')}`);
    }
    if (spec.validate) {
      const msg = spec.validate(value);
      if (typeof msg === 'string' && msg) problems.push(`${key}: ${msg}`);
    }
    out[key] = value;
  }

  if (problems.length > 0) {
    throw new ConfigError(`Invalid ${name}: ${problems.join('; ')}`, { problems });
  }
  return Object.freeze(out);
}
