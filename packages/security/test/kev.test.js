import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKevClient, annotateWithKev, auditLockfile, normalizeOsv } from '../src/index.js';
import { createMockTransport } from '@foulfoxhacks/ametherian-testing';

// Synthetic catalog in the CISA KEV JSON shape; not real entries.
const catalog = {
  title: 'CISA Catalog of Known Exploited Vulnerabilities',
  catalogVersion: '2099.01.01',
  dateReleased: '2099-01-01T00:00:00.000Z',
  count: 2,
  vulnerabilities: [
    { cveID: 'CVE-2099-0001', vendorProject: 'Example', product: 'example-lib', vulnerabilityName: 'Example RCE', dateAdded: '2099-01-01', dueDate: '2099-01-22', knownRansomwareCampaignUse: 'Known', cwes: ['CWE-94'], notes: 'stripped' },
    { cveID: 'CVE-2099-0002', vendorProject: 'Other', product: 'other', vulnerabilityName: 'Other', dateAdded: '2099-01-02', knownRansomwareCampaignUse: 'Unknown' },
  ],
};
const transport = () => createMockTransport({ 'GET https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json': { json: catalog } });

test('fetchCatalog validates the feed and indexes it by CVE with provenance', async () => {
  const kev = createKevClient({ transport: transport(), now: () => Date.parse('2099-01-03T00:00:00Z') });
  const c = await kev.fetchCatalog();
  assert.equal(c.version, '2099.01.01');
  assert.equal(c.size, 2);
  assert.equal(c.has('CVE-2099-0001'), true);
  assert.deepEqual({ ...c.get('CVE-2099-0001'), cwes: [...c.get('CVE-2099-0001').cwes] }, {
    cve: 'CVE-2099-0001', vendor: 'Example', product: 'example-lib', name: 'Example RCE',
    dateAdded: '2099-01-01', dueDate: '2099-01-22', ransomware: true, cwes: ['CWE-94'],
  });
  assert.equal(c.get('CVE-2099-0002').ransomware, false);
  assert.equal(c.get('CVE-2000-0000'), null);
  assert.equal(c.provenance.source, 'www.cisa.gov');
});

test('annotateWithKev flags exploited findings and sorts them first', async () => {
  const kev = await createKevClient({ transport: transport() }).fetchCatalog();
  const prov = { source: 'osv.dev', retrievedAt: '2099-01-01T00:00:00Z' };
  const mk = (id, cve) => normalizeOsv({
    id, modified: '2099-01-01T00:00:00Z', aliases: cve ? [cve] : [], database_specific: { severity: 'LOW' },
    affected: [{ package: { ecosystem: 'npm', name: 'example-lib' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '2.0.0' }] }] }],
  }, prov);
  const lock = { lockfileVersion: 3, packages: { 'node_modules/example-lib': { version: '1.0.0' } } };
  const report = auditLockfile(lock, [mk('GHSA-aaaa', null), mk('GHSA-bbbb', 'CVE-2099-0001')], { now: () => Date.parse('2099-01-01T01:00:00Z') });
  assert.deepEqual(report.findings.map((f) => f.advisoryId), ['GHSA-aaaa', 'GHSA-bbbb']);
  const annotated = annotateWithKev(report, kev);
  assert.equal(annotated.knownExploited, 1);
  assert.equal(annotated.findings[0].advisoryId, 'GHSA-bbbb');
  assert.equal(annotated.findings[0].knownExploited.ransomware, true);
  assert.equal(annotated.findings[0].knownExploited.catalogVersion, '2099.01.01');
  assert.equal(annotated.findings[1].knownExploited, null);
  assert.equal(annotated.findings[0].requiresHumanReview, true);
});

test('rejects malformed feeds and other hosts', async () => {
  const bad = createKevClient({
    transport: createMockTransport({ 'GET https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json': { json: { ...catalog, vulnerabilities: [{ cveID: 'not-a-cve' }] } } }),
  });
  await assert.rejects(bad.fetchCatalog(), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  const moved = createKevClient({
    transport: createMockTransport({ 'GET https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json': { status: 302, headers: { location: 'https://evil.example/kev.json' } } }),
  });
  await assert.rejects(moved.fetchCatalog(), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
});
