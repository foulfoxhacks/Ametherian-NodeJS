import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOsvClient, auditLockfile } from '../src/index.js';
import { createMockTransport } from '@foulfoxhacks/ametherian-testing';

// Synthetic OSV records for tests only; not real vulnerabilities.
const vuln = (id, fixed = '1.4.2') => ({
  id,
  modified: '2026-11-01T00:00:00Z',
  summary: `synthetic ${id}`,
  database_specific: { severity: 'HIGH' },
  affected: [{ package: { ecosystem: 'npm', name: 'example-lib' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed }] }] }],
});

const now = () => Date.parse('2026-11-24T00:00:00Z');

test('queryPackage posts the query, follows pages and adds provenance', async () => {
  const transport = createMockTransport({
    'POST https://api.osv.dev/v1/query': (req) => {
      const body = JSON.parse(req.body);
      assert.deepEqual(body.package, { ecosystem: 'npm', name: 'example-lib' });
      assert.equal(body.version, '1.0.0');
      return body.page_token ? { json: { vulns: [vuln('TEST-2')] } } : { json: { vulns: [vuln('TEST-1')], next_page_token: 'p2' } };
    },
  });
  const osv = createOsvClient({ transport, now });
  const advisories = await osv.queryPackage({ ecosystem: 'npm', name: 'example-lib', version: '1.0.0' });
  assert.deepEqual(advisories.map((a) => a.id), ['TEST-1', 'TEST-2']);
  assert.deepEqual({ ...advisories[0].provenance }, {
    source: 'api.osv.dev',
    retrievedAt: '2026-11-24T00:00:00.000Z',
    url: 'https://api.osv.dev/v1/query',
    confidence: 'high',
  });
  assert.equal(transport.calls.length, 2);
});

test('queryBatch de-duplicates IDs and fetches full records, ready for auditLockfile', async () => {
  const transport = createMockTransport({
    'POST https://api.osv.dev/v1/querybatch': { json: { results: [{ vulns: [{ id: 'TEST-1' }] }, { vulns: [{ id: 'TEST-1' }, { id: 'TEST-3' }] }, {}] } },
    'GET https://api.osv.dev/v1/vulns/TEST-1': { json: vuln('TEST-1') },
    'GET https://api.osv.dev/v1/vulns/TEST-3': { json: vuln('TEST-3', '2.0.0') },
  });
  const osv = createOsvClient({ transport, now });
  const advisories = await osv.queryBatch([
    { ecosystem: 'npm', name: 'example-lib', version: '1.0.0' },
    { ecosystem: 'npm', name: 'example-lib', version: '1.5.0' },
    { ecosystem: 'npm', name: 'safe', version: '1.0.0' },
  ]);
  assert.deepEqual(advisories.map((a) => a.id), ['TEST-1', 'TEST-3']);
  const lock = { lockfileVersion: 3, packages: { 'node_modules/example-lib': { version: '1.5.0' } } };
  const report = auditLockfile(lock, advisories, { now });
  assert.deepEqual(report.findings.map((f) => `${f.advisoryId}:${f.fixedIn}`), ['TEST-3:2.0.0']);
  assert.equal(await osv.queryBatch([]).then((a) => a.length), 0);
});

test('only HTTPS to the advisory host is allowed', async () => {
  const transport = createMockTransport({});
  assert.throws(() => createOsvClient({ transport, baseUrl: 'not a url' }));
  const insecure = createOsvClient({ transport, baseUrl: 'http://api.osv.dev' });
  await assert.rejects(insecure.getVuln('TEST-1'), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
  const redirecting = createOsvClient({
    transport: createMockTransport({ 'GET https://api.osv.dev/v1/vulns/TEST-1': { status: 302, headers: { location: 'https://evil.example/x' } } }),
  });
  await assert.rejects(redirecting.getVuln('TEST-1'), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
  assert.equal(transport.calls.length, 0);
});

test('rejects malformed IDs, inputs and responses', async () => {
  const transport = createMockTransport({ 'POST https://api.osv.dev/v1/query': { json: { vulns: [{ id: 'X' }] } } });
  const osv = createOsvClient({ transport, now });
  await assert.rejects(osv.getVuln('../../etc/passwd'), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  await assert.rejects(osv.queryPackage({ ecosystem: 'npm', name: '' , version: '1.0.0' }), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  await assert.rejects(osv.queryPackage({ ecosystem: 'npm', name: 'a', version: '1.0.0' }), { code: 'AMETHERIAN_SCHEMA_INVALID' });
});
