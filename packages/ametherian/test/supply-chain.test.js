/**
 * Supply-chain policy (prevents the class of GHSA-fw8c-xr5c-95f9, "Malicious
 * code in axios"): no package may depend on anything outside this workspace
 * at runtime, no install scripts may exist, and the lockfile may only resolve
 * third-party code as development-only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const packagesDir = new URL('packages/', root);
const manifests = fs
  .readdirSync(packagesDir)
  .map((d) => path.join(fileURLToPath(packagesDir), d, 'package.json'))
  .filter((p) => fs.existsSync(p))
  .map((p) => ({ path: p, json: JSON.parse(fs.readFileSync(p, 'utf8')) }));

const INTERNAL = /^@foulfoxhacks\/ametherian(-[a-z0-9]+)?$/;

test('every package depends only on workspace packages at runtime', () => {
  assert.ok(manifests.length >= 10);
  for (const { path: p, json } of manifests) {
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'devDependencies']) {
      for (const name of Object.keys(json[field] ?? {})) {
        assert.match(name, INTERNAL, `${p}: ${field} ${name} is not an Ametherian package`);
      }
    }
  }
});

test('no package has install-time lifecycle scripts', () => {
  for (const { path: p, json } of manifests) {
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']) {
      assert.equal(json.scripts?.[hook], undefined, `${p}: ${hook} script present`);
    }
  }
  const rootPkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(rootPkg.scripts?.[hook], undefined);
});

test('lockfile resolves third-party code only as development dependencies', () => {
  const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root), 'utf8'));
  const thirdParty = [];
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (!key.includes('node_modules/') || meta.link) continue;
    const name = meta.name ?? key.slice(key.lastIndexOf('node_modules/') + 13);
    if (INTERNAL.test(name)) continue;
    thirdParty.push({ name, dev: meta.dev === true, scripts: meta.hasInstallScript === true, integrity: meta.integrity });
  }
  for (const p of thirdParty) {
    assert.equal(p.dev, true, `${p.name} is resolved as a runtime dependency`);
    assert.equal(p.scripts, false, `${p.name} has install scripts`);
    assert.match(p.integrity ?? '', /^sha512-/, `${p.name} has no sha512 integrity`);
  }
  const allowedDev = new Set(['typescript', '@types/node', 'undici-types']);
  for (const p of thirdParty) assert.ok(allowedDev.has(p.name), `unexpected dev package ${p.name}; review and add it deliberately`);
});
