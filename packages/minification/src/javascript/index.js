import { MinificationError } from '../errors.js';

const LEVELS = new Set(['conservative', 'standard']);
const TARGETS = new Set(['es2020', 'es2021', 'es2022', 'es2023', 'esnext']);

export function createJavaScriptMinifier(options = {}) {
  if (typeof options.transform !== 'function') {
    throw new MinificationError('A parser-backed JavaScript transform function is required', {
      code: 'AMETHERIAN_MINIFICATION_ENGINE_REQUIRED',
    });
  }
  const transform = options.transform;
  return async function minifyJavaScript(source, config = {}) {
    const level = config.level ?? 'standard';
    const target = config.target ?? 'es2022';
    if (!LEVELS.has(level)) {
      throw new MinificationError('Unsupported JavaScript minification level', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS', details: { level },
      });
    }
    if (!TARGETS.has(target)) {
      throw new MinificationError('Unsupported JavaScript output target', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS', details: { target },
      });
    }
    const result = await transform(source, {
      loader: 'js', target,
      minifyWhitespace: true,
      minifySyntax: level === 'standard',
      minifyIdentifiers: level === 'standard',
      legalComments: 'none',
      ...(config.sourceMap ? { sourcemap: 'external' } : {}),
    });
    return {
      code: result?.code,
      map: config.sourceMap ? result?.map ?? null : null,
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      engine: 'injected-javascript-transform',
    };
  };
}
