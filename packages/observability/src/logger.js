/**
 * Structured logger with redaction on by default. Records are plain objects
 * handed to a sink; the default sink writes one JSON line to stderr.
 */
import { redactHeaders, redactUrl, REDACTED, isAmetherianError, validateOptions } from '@foulfoxhacks/ametherian-core';

export const LEVELS = Object.freeze({ trace: 10, debug: 20, info: 30, warn: 40, error: 50, silent: 100 });

const SECRET_KEY = /pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|session/i;
const MAX_DEPTH = 6;
const MAX_STRING = 8_192;

/** Serialise an error without leaking secrets from its message-free fields. */
export function serializeError(err, includeStack = false) {
  if (isAmetherianError(err)) {
    const out = err.toJSON();
    if (err.cause !== undefined) out.cause = serializeError(err.cause, includeStack);
    if (includeStack) out.stack = err.stack;
    return out;
  }
  if (err instanceof Error) {
    const out = { name: err.name, message: err.message };
    if (typeof err.code === 'string') out.code = err.code;
    if (err.cause !== undefined) out.cause = serializeError(err.cause, includeStack);
    if (includeStack) out.stack = err.stack;
    return out;
  }
  return { message: String(err) };
}

/**
 * Deep-copy a value for logging, redacting secret-looking keys, `headers`
 * and `url` fields, truncating long strings and bounding depth/cycles.
 */
export function sanitize(value, options = {}, depth = 0, seen = new WeakSet()) {
  const includeStack = options.includeStack ?? false;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > MAX_STRING) return `${value.slice(0, MAX_STRING)}…[truncated]`;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
    return value;
  }
  if (value instanceof Error) return serializeError(value, includeStack);
  if (value instanceof URL) return redactUrl(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof Headers !== 'undefined' && value instanceof Headers) return { ...redactHeaders(value) };
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[max depth]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitize(v, options, depth + 1, seen));
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name} ${value.byteLength} bytes]`;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === '__proto__') continue;
    if (SECRET_KEY.test(k) || options.redactKeys?.includes(k)) out[k] = v === undefined ? undefined : REDACTED;
    else if (k === 'headers' && v && typeof v === 'object') out[k] = { ...redactHeaders(v) };
    else if ((k === 'url' || k === 'href') && (typeof v === 'string' || v instanceof URL)) out[k] = redactUrl(v);
    else out[k] = sanitize(v, options, depth + 1, seen);
  }
  return out;
}

// JSON lines on stderr in Node; console on runtimes without process.stderr (Workers, browsers).
const defaultSink = (record) => {
  const line = JSON.stringify(record);
  const stderr = globalThis.process?.stderr;
  if (stderr?.write) stderr.write(`${line}\n`);
  else console.error(line);
};

/**
 * @param {{ level?: keyof typeof LEVELS, sink?: (record: object) => void, fields?: object,
 *           redactKeys?: string[], includeStack?: boolean, now?: () => Date }} [options]
 */
export function createLogger(options) {
  const o = validateOptions(options, {
    level: { type: 'string', oneOf: Object.keys(LEVELS), default: 'info' },
    sink: { type: 'function', default: defaultSink },
    fields: { type: 'object', default: {} },
    redactKeys: { type: 'array', default: [] },
    includeStack: { type: 'boolean', default: false },
    now: { type: 'function', default: () => new Date() },
  }, { name: 'logger options' });
  const threshold = LEVELS[o.level];
  const base = sanitize(o.fields, o);

  function write(level, msg, fields) {
    if (LEVELS[level] < threshold) return;
    const extra = fields === undefined ? {} : typeof fields === 'object' && fields !== null && !Array.isArray(fields) ? fields : { data: fields };
    const record = { time: o.now().toISOString(), level, msg: String(msg), ...base, ...sanitize(extra, o) };
    try {
      o.sink(record);
    } catch {
      // Logging must never break the caller.
    }
  }

  const logger = {
    level: o.level,
    isEnabled: (level) => LEVELS[level] >= threshold,
    child: (fields) => createLogger({ ...o, fields: { ...o.fields, ...fields } }),
  };
  for (const level of ['trace', 'debug', 'info', 'warn', 'error']) {
    logger[level] = (msg, fields) => write(level, msg, fields);
  }
  return Object.freeze(logger);
}
