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
    if (typeof filename !== 'string' || filename.length > 1024 || filename.includes('\0')) {
      throw new MinificationError('Invalid CSS source filename', {
        code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS',
      });
    }
    if (config.sourceMap !== undefined && typeof config.sourceMap !== 'boolean') {
      throw new MinificationError('sourceMap must be a boolean', { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
    }
    let targets;
    if (config.targets !== undefined) {
      const allowed = new Set(['and_chr', 'and_ff', 'android', 'chrome', 'edge', 'firefox', 'ie', 'ios_saf', 'opera', 'safari', 'samsung']);
      if (!config.targets || typeof config.targets !== 'object' || Array.isArray(config.targets)) {
        throw new MinificationError('targets must be a browser-version object', { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
      }
      targets = {};
      for (const [browser, version] of Object.entries(config.targets)) {
        if (!allowed.has(browser) || !Number.isSafeInteger(version) || version < 0 || version > 65535) {
          throw new MinificationError('Invalid CSS browser target', { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS', details: { browser } });
        }
        targets[browser] = version;
      }
    }
    const result = await transform({
      filename,
      code: Buffer.from(source, 'utf8'),
      minify: true,
      ...(config.sourceMap ? { sourceMap: true } : {}),
      ...(targets ? { targets } : {}),
    });
    return {
      code: result?.code,
      map: config.sourceMap ? result?.map ?? null : null,
      warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      engine: 'injected-cascade-transform',
    };
  };
}
