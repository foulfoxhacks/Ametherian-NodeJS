import { MinificationError } from './errors.js';
import { DEFAULT_LIMITS, normalizeEngineCode, normalizeSourceMap, validateLimits, validateSource, byteLength } from './shared.js';

export { MinificationError } from './errors.js';
export { createJavaScriptMinifier } from './javascript/index.js';
export { createCascadeMinifier } from './cascade/index.js';

export function createMinificationEngine(options = {}) {
  if (typeof options.javascript !== 'function' || typeof options.cascade !== 'function') {
    throw new MinificationError('Both JavaScript and cascade minifier adapters are required', {
      code: 'AMETHERIAN_MINIFICATION_ENGINE_REQUIRED',
    });
  }
  const limits = validateLimits(options.limits);
  async function run(kind, adapter, source, config = {}) {
    const inputBytes = validateSource(source, limits.maxInputBytes);
    const started = performance.now();
    let raw;
    try {
      raw = await adapter(source, config);
    } catch (cause) {
      if (cause instanceof MinificationError) throw cause;
      throw new MinificationError(kind + ' minification failed', {
        code: 'AMETHERIAN_MINIFICATION_FAILED', cause,
      });
    }
    const code = normalizeEngineCode(raw?.code);
    const outputBytes = byteLength(code);
    if (outputBytes > limits.maxOutputBytes) {
      throw new MinificationError('Minifier output exceeds the configured output limit', {
        code: 'AMETHERIAN_MINIFICATION_OUTPUT_LIMIT',
        details: { outputBytes, maxOutputBytes: limits.maxOutputBytes },
      });
    }
    const map = normalizeSourceMap(raw?.map);
    const sourceMapBytes = map === null ? 0 : byteLength(map);
    if (sourceMapBytes > limits.maxSourceMapBytes) {
      throw new MinificationError('Source map exceeds the configured source-map limit', {
        code: 'AMETHERIAN_MINIFICATION_SOURCEMAP_LIMIT',
        details: { sourceMapBytes, maxSourceMapBytes: limits.maxSourceMapBytes },
      });
    }
    const durationMs = Number((performance.now() - started).toFixed(3));
    const stats = Object.freeze({
      inputBytes, outputBytes, savedBytes: inputBytes - outputBytes,
      reductionPercent: inputBytes === 0 ? 0 : Number(((inputBytes - outputBytes) / inputBytes * 100).toFixed(2)),
      durationMs,
    });
    return Object.freeze({
      type: kind, code, map,
      warnings: Object.freeze((raw?.warnings == null ? [] : Array.isArray(raw.warnings) ? raw.warnings : (() => { throw new MinificationError('Minifier engine returned invalid warnings', { code: 'AMETHERIAN_MINIFICATION_INVALID_ENGINE_OUTPUT' }); })()).slice(0, 100)),
      engine: String(raw?.engine ?? 'custom'), stats,
    });
  }
  return Object.freeze({
    limits,
    minifyJavaScript: (source, config) => run('javascript', options.javascript, source, config),
    minifyCascade: (source, config) => run('cascade', options.cascade, source, config),
    minify: (type, source, config) => {
      if (type === 'javascript') return run('javascript', options.javascript, source, config);
      if (type === 'cascade') return run('cascade', options.cascade, source, config);
      throw new MinificationError('Unknown minification type', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS', details: { type },
      });
    },
  });
}
export { DEFAULT_LIMITS };
