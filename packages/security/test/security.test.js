import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemver,
  compareSemver,
  normalizeOsv,
  checkAffected,
  packagesFromLockfile,
  auditLockfile,
} from '../src/index.js';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

test('parseSemver accepts valid and rejects invalid versions', () => {
  assert.deepEqual(parseSemver('1.2.3-alpha.1+build.5'), { major: 1, minor: 2, patch: 3, pre: ['alpha', 1] });
  assert.deepEqual(parseSemver('v0.0.1'), { major: 0, minor: 0, patch: 1, pre: [] });
  for (const bad of ['1.2', '01.2.3', '1.2.3-', '1.2.3-01', 'latest', '', '1.2.3.4', null, '9'.repeat(300)]) {
    assert.equal(parseSemver(bad), null, String(bad).slice(0, 20));
  }
});

test('compareSemver follows SemVer precedence', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.equal(compareSemver(ordered[i], ordered[i + 1]), -1, `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareSemver(ordered[i + 1], ordered[i]), 1);
  }
  assert.equal(compareSemver('1.0.0+a', '1.0.0+b'), 0);
  assert.throws(() => compareSemver('x', '1.0.0'), TypeError);
});

const prov = { source: 'osv.dev', retrievedAt: '2026-11-24T00:00:00Z', url: 'https://api.osv.dev/v1/vulns/GHSA-test' };

// Synthetic advisory for tests only; not a real vulnerability.
const raw = {
  id: 'GHSA-test-0001',
  modified: '2026-11-01T00:00:00Z',
  published: '2026-10-01T00:00:00Z',
  aliases: ['CVE-0000-0001'],
  summary: 'Example prototype pollution in example-lib',
  details: 'x'.repeat(10_000),
  database_specific: { severity: 'HIGH' },
  affected: [
    {
      package: { ecosystem: 'npm', name: 'example-lib' },
      ranges: [
        { type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.4.2' }] },
        { type: 'SEMVER', events: [{ introduced: '2.0.0' }, { fixed: '2.1.0' }] },
      ],
    },
    {
      package: { ecosystem: 'npm', name: 'other-lib' },
      ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '3.0.0' }, { last_affected: '3.2.0' }] }],
      versions: ['9.9.9'],
    },
    { package: { ecosystem: 'PyPI', name: 'example-lib' }, ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }] }] },
  ],
  extra_field: 'ignored',
};

test('normalizeOsv validates, strips unknown fields and keeps provenance', () => {
  const adv = normalizeOsv(raw, prov);
  assert.equal(adv.id, 'GHSA-test-0001');
  assert.equal(adv.severity, 'HIGH');
  assert.deepEqual(adv.aliases, ['CVE-0000-0001']);
  assert.equal(adv.provenance.source, 'osv.dev');
  assert.equal(adv.provenance.confidence, 'high');
  assert.equal(adv.affected.length, 3);
  assert.ok(Object.isFrozen(adv));
  assert.equal('extra_field' in adv, false);
});

test('normalizeOsv rejects malformed records and provenance', () => {
  assert.throws(() => normalizeOsv({ id: 'x' }, prov), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  assert.throws(() => normalizeOsv(raw, { source: 'osv' }), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  assert.throws(() => normalizeOsv(raw, { ...prov, retrievedAt: 'yesterday' }), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  const polluted = normalizeOsv(JSON.parse('{"id":"x","modified":"t","__proto__":{"p":1}}'), prov);
  assert.equal(polluted.p, undefined);
  assert.equal({}.p, undefined);
});

test('checkAffected evaluates introduced/fixed/last_affected ranges and explicit versions', () => {
  const adv = normalizeOsv(raw, prov);
  const cases = [
    ['example-lib', '1.0.0', true, '1.4.2'],
    ['example-lib', '1.4.1', true, '1.4.2'],
    ['example-lib', '1.4.2', false],
    ['example-lib', '1.9.0', false],
    ['example-lib', '2.0.0', true, '2.1.0'],
    ['example-lib', '2.0.5-beta.1', true, '2.1.0'],
    ['example-lib', '2.1.0', false],
    ['other-lib', '2.9.9', false],
    ['other-lib', '3.0.0', true, null],
    ['other-lib', '3.2.0', true, null],
    ['other-lib', '3.2.1', false],
    ['other-lib', '9.9.9', true, null],
    ['unrelated', '1.0.0', false],
  ];
  for (const [name, version, affected, fixedIn] of cases) {
    const r = checkAffected(adv, 'npm', name, version);
    assert.equal(r.affected, affected, `${name}@${version}`);
    if (affected) assert.equal(r.fixedIn, fixedIn, `${name}@${version} fixedIn`);
  }
  assert.deepEqual(checkAffected(adv, 'npm', 'example-lib', 'not-a-version'), { affected: false, reason: 'unparseable-version' });
  const withdrawn = normalizeOsv({ ...raw, withdrawn: '2026-11-02T00:00:00Z' }, prov);
  assert.deepEqual(checkAffected(withdrawn, 'npm', 'example-lib', '1.0.0'), { affected: false, reason: 'withdrawn' });
});

const lockfile = {
  name: 'app',
  lockfileVersion: 3,
  packages: {
    '': { name: 'app', version: '1.0.0' },
    'node_modules/example-lib': { version: '1.4.0' },
    'node_modules/a/node_modules/example-lib': { version: '2.0.1', dev: true },
    'node_modules/other-lib': { version: '3.1.0' },
    'node_modules/safe': { version: '1.0.0' },
    'node_modules/linked': { link: true, resolved: 'packages/linked' },
    'node_modules/@scope/pkg': { version: '0.1.0' },
  },
};

test('packagesFromLockfile reads v2/v3 lockfiles', () => {
  const pkgs = packagesFromLockfile(JSON.stringify(lockfile));
  assert.deepEqual(pkgs.map((p) => `${p.name}@${p.version}`), [
    'example-lib@1.4.0',
    'example-lib@2.0.1',
    'other-lib@3.1.0',
    'safe@1.0.0',
    '@scope/pkg@0.1.0',
  ]);
  assert.equal(pkgs[1].dev, true);
  assert.throws(() => packagesFromLockfile({ lockfileVersion: 1, dependencies: {} }), { code: ErrorCodes.CONFIG });
});

test('auditLockfile reports findings with provenance, staleness and review flag', () => {
  const adv = normalizeOsv(raw, prov);
  const report = auditLockfile(lockfile, [adv], { now: () => Date.parse('2026-11-24T12:00:00Z') });
  assert.equal(report.scanned, 5);
  assert.equal(report.findings.length, 3);
  const first = report.findings[0];
  assert.equal(first.severity, 'HIGH');
  assert.equal(first.requiresHumanReview, true);
  assert.equal(first.stale, false);
  assert.equal(first.provenance.source, 'osv.dev');
  assert.deepEqual(
    report.findings.map((f) => `${f.package}@${f.version}->${f.fixedIn}`),
    ['example-lib@1.4.0->1.4.2', 'example-lib@2.0.1->2.1.0', 'other-lib@3.1.0->null'],
  );
  const later = auditLockfile(lockfile, [adv], { now: () => Date.parse('2026-12-24T00:00:00Z') });
  assert.equal(later.findings[0].stale, true);
});

test('this repository lockfile audits cleanly against the synthetic advisory', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8');
  const report = auditLockfile(text, [normalizeOsv(raw, prov)]);
  assert.equal(report.findings.length, 0);
});
