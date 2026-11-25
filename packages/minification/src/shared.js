import { MinificationError } from './errors.js';

export const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 8 * 1024 * 1024,
  maxOutputBytes: 16 * 1024 * 1024,
  maxSourceMapBytes: 16 * 1024 * 1024,
});

export function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

export function validateSource(source, maxInputBytes) {
  if (typeof source !== 'string') {
    throw new MinificationError('Source must be a UTF-8 string', { code: 'AMETHERIAN_MINIFICATION_INVALID_INPUT' });
  }
  const inputBytes = byteLength(source);
  if (inputBytes > maxInputBytes) {
    throw new MinificationError('Source exceeds the configured input limit', {
      code: 'AMETHERIAN_MINIFICATION_INPUT_LIMIT', details: { inputBytes, maxInputBytes },
    });
  }
  return inputBytes;
}

export function normalizeEngineCode(code) {
  if (typeof code === 'string') return code;
  if (code instanceof Uint8Array) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(code); }
    catch (cause) {
      throw new MinificationError('Minifier engine returned invalid UTF-8 code', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_ENGINE_OUTPUT', cause,
      });
    }
  }
  throw new MinificationError('Minifier engine returned an unsupported code value', {
    code: 'AMETHERIAN_MINIFICATION_INVALID_ENGINE_OUTPUT',
  });
}

export function normalizeSourceMap(map) {
  if (map == null) return null;
  if (typeof map === 'string') return map;
  if (typeof map.toString === 'function') {
    const value = map.toString();
    if (typeof value === 'string' && value !== '[object Object]') return value;
  }
  throw new MinificationError('Minifier engine returned an unsupported source map', {
    code: 'AMETHERIAN_MINIFICATION_INVALID_ENGINE_OUTPUT',
  });
}

export function validateLimits(limits = {}) {
  const merged = { ...DEFAULT_LIMITS, ...limits };
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    if (!Number.isSafeInteger(merged[key]) || merged[key] < 1) {
      throw new MinificationError(key + ' must be a positive safe integer', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS', details: { key },
      });
    }
  }
  return Object.freeze(merged);
}
