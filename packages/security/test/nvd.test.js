import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNvdClient, compareWithBaseline, createOsvClient } from '../src/index.js';
import { createMockTransport } from '@foulfoxhacks/ametherian-testing';

// Synthetic NVD response shape (CVE API 2.0); not a real record.
const nvdBody = (id) => ({
  resultsPerPage: 1,
  startIndex: 0,
  totalResults: 1,
  vulnerabilities: [
    {
      cve: {
        id,
        published: '2026-01-01T00:00:00.000',
        lastModified: '2026-01-02T00:00:00.000',
        vulnStatus: 'Analyzed',
        descriptions: [{ lang: 'en', value: 'Synthetic description' }, { lang: 'es', value: 'x' }],
        metrics: { cvssMetricV31: [{ source: 'nvd', cvssData: { version: '3.1', baseScore: 7.5, baseSeverity: 'HIGH', vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' } }] },
        weaknesses: [{ description: [{ lang: 'en', value: 'CWE-770' }] }, { description: [{ lang: 'en', value: 'CWE-770' }] }],
        extra: 'stripped',
      },
    },
  ],
});

test('getCve returns CVSS, CWE and provenance; API key only in header', async () => {
  const transport = createMockTransport({
    'GET https://services.nvd.nist.gov/rest/json/cves/2.0': (req) => {
      assert.equal(new URL(req.url).searchParams.get('cveId'), 'CVE-2099-0001');
      assert.equal(req.headers.apikey, 'k-123');
      return { json: nvdBody('CVE-2099-0001') };
    },
  });
  const nvd = createNvdClient({ transport, apiKey: 'k-123', now: () => Date.parse('2026-11-24T00:00:00Z'), minIntervalMs: 0 });
  const cve = await nvd.getCve('CVE-2099-0001');
  assert.equal(cve.id, 'CVE-2099-0001');
  assert.deepEqual({ ...cve.cvss }, { version: '3.1', score: 7.5, severity: 'HIGH', vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' });
  assert.deepEqual([...cve.cwes], ['CWE-770']);
  assert.equal(cve.description, 'Synthetic description');
  assert.equal(cve.provenance.source, 'nvd.nist.gov');
  assert.ok(!JSON.stringify(cve).includes('k-123'), 'API key never appears in results');
});

test('getCve returns null for unknown IDs and rejects malformed IDs', async () => {
  const transport = createMockTransport({
    'GET https://services.nvd.nist.gov/rest/json/cves/2.0': { json: { totalResults: 0, vulnerabilities: [] } },
  });
  const nvd = createNvdClient({ transport, minIntervalMs: 0 });
  assert.equal(await nvd.getCve('CVE-2099-9999'), null);
  await assert.rejects(nvd.getCve('CVE-2099-1&apiKey=x'), { code: 'AMETHERIAN_SCHEMA_INVALID' });
  await assert.rejects(nvd.getCve('../../x'), { code: 'AMETHERIAN_SCHEMA_INVALID' });
});

test('requests are spaced to respect NVD rate limits', async () => {
  let t = 0;
  const waits = [];
  const transport = createMockTransport({ 'GET https://services.nvd.nist.gov/rest/json/cves/2.0': { json: nvdBody('CVE-2099-0002') } });
  const nvd = createNvdClient({
    transport,
    now: () => t,
    sleep: async (ms) => {
      waits.push(ms);
      t += ms;
    },
  });
  await nvd.getCve('CVE-2099-0002');
  await nvd.getCve('CVE-2099-0002');
  assert.deepEqual(waits, [6500], 'unauthenticated clients wait ~6.5 s between calls');
});

test('NVD client refuses other hosts and plain HTTP redirects', async () => {
  const transport = createMockTransport({
    'GET https://services.nvd.nist.gov/rest/json/cves/2.0': { status: 302, headers: { location: 'http://services.nvd.nist.gov/x' } },
  });
  const nvd = createNvdClient({ transport, minIntervalMs: 0 });
  await assert.rejects(nvd.getCve('CVE-2099-0003'), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
});

test('compareWithBaseline finds new, removed and updated advisories', () => {
  const baseline = { advisories: [{ ghsa: 'GHSA-a', modified: '2026-01-01' }, { ghsa: 'GHSA-b', modified: '2026-01-01' }] };
  const r = compareWithBaseline(baseline, [
    { ghsa: 'GHSA-a', modified: '2026-02-01' },
    { ghsa: 'GHSA-c', modified: '2026-03-01' },
    { ghsa: 'GHSA-b', withdrawn: true },
  ]);
  assert.deepEqual(r.added.map((x) => x.ghsa), ['GHSA-c']);
  assert.deepEqual(r.removed.map((x) => x.ghsa), ['GHSA-b']);
  assert.deepEqual(r.updated.map((x) => x.ghsa), ['GHSA-a']);
  assert.equal(r.ok, false);
  assert.equal(compareWithBaseline(baseline, [{ ghsa: 'GHSA-a' }, { ghsa: 'GHSA-b' }]).ok, true);
});

test('OSV queryAllVersions follows pages without a version', async () => {
  const transport = createMockTransport({
    'POST https://api.osv.dev/v1/query': (req) => {
      const body = JSON.parse(req.body);
      assert.equal(body.version, undefined);
      return body.page_token
        ? { json: { vulns: [{ id: 'GHSA-2', modified: '2026-01-01T00:00:00Z' }] } }
        : { json: { vulns: [{ id: 'GHSA-1', modified: '2026-01-01T00:00:00Z' }], next_page_token: 't' } };
    },
  });
  const osv = createOsvClient({ transport });
  const all = await osv.queryAllVersions({ ecosystem: 'npm', name: 'undici' });
  assert.deepEqual(all.map((a) => a.id), ['GHSA-1', 'GHSA-2']);
});
