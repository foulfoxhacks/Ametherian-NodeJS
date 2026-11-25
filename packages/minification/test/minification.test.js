import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMinificationEngine, createJavaScriptMinifier, createCascadeMinifier } from '../src/index.js';

test('JavaScript adapter uses conservative or standard parser-backed options', async () => {
  const calls = [];
  const adapter = createJavaScriptMinifier({
    transform: async (source, options) => {
      calls.push({ source, options });
      return { code: source.replaceAll(' ', ''), map: options.sourcemap ? '{"version":3}' : undefined, warnings: [] };
    },
  });
  const engine = createMinificationEngine({ javascript: adapter, cascade: async (source) => ({ code: source }) });
  const result = await engine.minifyJavaScript('const x = 1;', { level: 'conservative', target: 'es2022', sourceMap: true });
  assert.equal(result.type, 'javascript');
  assert.equal(calls[0].options.minifySyntax, false);
  assert.equal(calls[0].options.minifyIdentifiers, false);
  assert.equal(calls[0].options.sourcemap, 'external');
  assert.equal(result.map, '{"version":3}');
  assert.ok(result.stats.inputBytes > result.stats.outputBytes);
});

test('cascade adapter passes CSS as bytes and requests parser-backed minification', async () => {
  let call;
  const adapter = createCascadeMinifier({
    transform: async (options) => { call = options; return { code: Buffer.from('a{color:red}'), map: null }; },
  });
  const engine = createMinificationEngine({ javascript: async (source) => ({ code: source }), cascade: adapter });
  const result = await engine.minifyCascade('a { color: red; }', { filename: 'site.css' });
  assert.equal(call.filename, 'site.css');
  assert.equal(Buffer.isBuffer(call.code), true);
  assert.equal(call.minify, true);
  assert.equal(result.code, 'a{color:red}');
});

test('rejects missing engines, unsupported options, invalid input and size overflow', async () => {
  assert.throws(() => createJavaScriptMinifier(), { code: 'AMETHERIAN_MINIFICATION_ENGINE_REQUIRED' });
  const js = createJavaScriptMinifier({ transform: async (source) => ({ code: source }) });
  const engine = createMinificationEngine({
    javascript: js, cascade: async (source) => ({ code: source }),
    limits: { maxInputBytes: 4, maxOutputBytes: 8 },
  });
  await assert.rejects(engine.minifyJavaScript('const x = 1;', { target: 'es2015' }), { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
  await assert.rejects(engine.minifyJavaScript('12345'), { code: 'AMETHERIAN_MINIFICATION_INPUT_LIMIT' });
  await assert.rejects(engine.minifyJavaScript(123), { code: 'AMETHERIAN_MINIFICATION_INVALID_INPUT' });
  const oversized = createMinificationEngine({
    javascript: async () => ({ code: '123456789' }), cascade: async (source) => ({ code: source }),
    limits: { maxInputBytes: 20, maxOutputBytes: 8 },
  });
  await assert.rejects(oversized.minifyJavaScript('x'), { code: 'AMETHERIAN_MINIFICATION_OUTPUT_LIMIT' });
});

test('wraps parser errors and rejects malformed engine output', async () => {
  const engine = createMinificationEngine({
    javascript: async () => { throw new Error('parser failed'); },
    cascade: async () => ({ code: {} }),
  });
  await assert.rejects(engine.minifyJavaScript('x'), { code: 'AMETHERIAN_MINIFICATION_FAILED' });
  await assert.rejects(engine.minifyCascade('x'), { code: 'AMETHERIAN_MINIFICATION_INVALID_ENGINE_OUTPUT' });
  await assert.rejects(engine.minify('wasm', 'x'), { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
});

test('rejects invalid limits and CSS filenames', async () => {
  assert.throws(() => createMinificationEngine({
    javascript: async (source) => ({ code: source }), cascade: async (source) => ({ code: source }),
    limits: { maxInputBytes: 0 },
  }), { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
  const cascade = createCascadeMinifier({ transform: async (options) => ({ code: options.code }) });
  const engine = createMinificationEngine({ javascript: async (source) => ({ code: source }), cascade });
  await assert.rejects(engine.minifyCascade('x', { filename: '../bad\0name.css' }), { code: 'AMETHERIAN_MINIFICATION_INVALID_OPTIONS' });
});
