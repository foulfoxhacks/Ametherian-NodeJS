/**
 * Edge portability: the entry points that must run on Cloudflare Workers,
 * Deno and browsers may not statically import node: modules or use the
 * Node-only globals Buffer / require. Built-ins needed for optional features
 * are loaded lazily via process.getBuiltinModule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packages = fileURLToPath(new URL('../../', import.meta.url));
const ENTRIES = [
  'core/src/index.js',
  'guard/src/index.js',
  'schema/src/index.js',
  'cache/src/index.js',
  'resilience/src/index.js',
  'observability/src/index.js',
  'frontmatter/src/index.js',
  'youtube-chat/src/index.js',
  'http/src/edge.js',
];

function entryOf(spec) {
  const name = spec.replace('@foulfoxhacks/ametherian-', '');
  const pkg = JSON.parse(fs.readFileSync(path.join(packages, name, 'package.json'), 'utf8'));
  const exp = pkg.exports['.'];
  return path.join(packages, name, exp.workerd ?? exp.default);
}

function walk(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1];
    if (spec.startsWith('.')) walk(path.resolve(path.dirname(file), spec), seen);
    else if (spec.startsWith('@foulfoxhacks/')) walk(entryOf(spec), seen);
  }
  return seen;
}

test('edge entry points have no static node: imports or Node-only globals', () => {
  const problems = [];
  const all = new Set();
  for (const entry of ENTRIES) for (const f of walk(path.join(packages, entry))) all.add(f);
  for (const file of all) {
    const src = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const rel = path.relative(packages, file);
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](node:[^'"]+)['"]|import\s+['"](node:[^'"]+)['"]/g)) {
      problems.push(`${rel}: static import of ${m[1] ?? m[2]}`);
    }
    if (/\bBuffer\s*\./.test(src)) problems.push(`${rel}: uses Buffer`);
    if (/\brequire\s*\(/.test(src)) problems.push(`${rel}: uses require()`);
    if (/(^|[^.?\w])process\.(?!env\b)/.test(src)) problems.push(`${rel}: uses process without optional chaining`);
  }
  assert.ok(all.size > 15, `walked ${all.size} files`);
  assert.deepEqual(problems, []);
});

test('the http package selects the edge build under Workers export conditions', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packages, 'http', 'package.json'), 'utf8'));
  for (const condition of ['workerd', 'worker', 'browser', 'deno']) {
    assert.equal(pkg.exports['.'][condition], './src/edge.js', condition);
  }
  assert.equal(pkg.exports['./edge'].default, './src/edge.js');
  assert.equal(pkg.exports['.'].default, './src/index.js');
});
