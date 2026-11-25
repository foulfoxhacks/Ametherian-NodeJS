import { MinificationError } from '../errors.js';

export function createCascadeMinifier(options = {}) {
  if (typeof options.transform !== 'function') {
    throw new MinificationError('A standards-aware CSS transform function is required', {
      code: 'AMETHERIAN_MINIFICATION_ENGINE_REQUIRED',
    });
  }
  const transform = options.transform;
  return async function minifyCascade(source, config = {}) {
    const filename = config.filename ?? 'input.css';
    if (typeof filename !== 'string' || filename.length > 1024 || filename.includes('\\0')) {
      throw new MinificationError('Invalid CSS source filename', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS',
      });
    }
    if (config.sourceMap !== undefined && typeof config.sourceMap !== 'boolean') {
      throw new MinificationError('sourceMap must be a boolean', { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
    }
    const result = await transform({
      filename,
      code: Buffer.from(source, 'utf8'),
      minify: true,
      ...(config.sourceMap ? { sourceMap: true } : {}),
      ...(config.targets ? { targets: config.targets } : {}),
    });
    return {
      code: result?.code,
      map: config.sourceMap ? result?.map ?? null : null,
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      engine: 'injected-cascade-transform',
    };
  };
}
