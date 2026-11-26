import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runAudit, sanitizeForTerminal, EXIT_OK, EXIT_FINDINGS, EXIT_INCOMPLETE } from '../src/cli.js';
import { normalizeOsv } from '../src/index.js';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const prov = { source: 'osv.dev', retrievedAt: '2026-11-26T11:00:00Z', url: 'https://api.osv.dev/v1/vulns/x' };

// Synthetic advisories for tests only; not real vulnerabilities.
const osvRecord = (id, name, fixed, severity, aliases = []) => ({
  id,
  modified: '2026-11-01T00:00:00Z',
  aliases,
  summary: `Example issue in ${name}`,
  database_specific: { severity },
  affected: [{ package: { ecosystem: 'npm', name }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed }] }] }],
});
const RECORDS = {
  high: osvRecord('GHSA-test-high', 'example-lib', '1.4.2', 'HIGH', ['CVE-0000-0001']),
  low: osvRecord('GHSA-test-low1', 'dev-only-lib', '2.0.0', 'LOW'),
  exploited: osvRecord('GHSA-test-kev1', 'tiny-lib', '0.3.0', 'LOW', ['CVE-0000-0002']),
};

const lockfile = (packages) => JSON.stringify({
  name: 'fixture',
  lockfileVersion: 3,
  packages: { '': { name: 'fixture' }, ...packages },
});
const LOCK = lockfile({
  'node_modules/example-lib': { version: '1.4.1' },
  'node_modules/dev-only-lib': { version: '1.0.0', dev: true },
  'node_modules/tiny-lib': { version: '0.2.0' },
  'node_modules/safe-lib': { version: '5.0.0' },
});

const catalog = {
  version: '2026.11.25',
  released: '2026-11-25T18:00:00Z',
  count: 1,
  provenance: { source: 'www.cisa.gov', retrievedAt: '2026-11-26T11:00:00Z', url: 'https://www.cisa.gov/kev', confidence: 'high' },
  get: (cve) => (cve === 'CVE-0000-0002'
    ? { cve, vendor: 'Example', product: 'tiny-lib', name: 'Example exploited issue', dateAdded: '2026-11-20', dueDate: null, ransomware: false, cwes: [] }
    : null),
};

function harness({ records = Object.values(RECORDS), files = { 'package-lock.json': LOCK }, kev = catalog, nvdFails = false } = {}) {
  const out = []; const err = []; const written = {}; const calls = { osv: [], nvd: [] };
  const io = {
    now: () => NOW,
    readFile: async (path) => {
      if (!(path in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return files[path];
    },
    writeFile: async (path, text) => { written[path] = text; },
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    createOsvClient: () => ({
      queryBatch: async (pkgs) => {
        calls.osv.push(pkgs);
        const names = new Set(pkgs.map((p) => p.name));
        return records.filter((r) => names.has(r.affected[0].package.name)).map((r) => normalizeOsv(r, prov));
      },
      close: () => {},
    }),
    createKevClient: () => ({
      fetchCatalog: async () => { if (kev instanceof Error) throw kev; return kev; },
      close: () => {},
    }),
    createNvdClient: () => ({
      getCve: async (id) => {
        calls.nvd.push(id);
        if (nvdFails) throw Object.assign(new Error('rate limited'), { code: 'AMETHERIAN_HTTP_STATUS' });
        return { id, cvss: { score: 7.5, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' } };
      },
      close: () => {},
    }),
  };
  return { io, out: () => out.join(''), err: () => err.join(''), written, calls };
}

test('reports findings and fails on high by default', async () => {
  const h = harness();
  const code = await runAudit([], h.io);
  assert.equal(code, EXIT_FINDINGS);
  const text = h.out();
  assert.match(text, /Scanned 4 packages against 3 advisories/);
  assert.match(text, /HIGH {6}example-lib@1\.4\.1 {2}GHSA-test-high, CVE-0000-0001/);
  assert.match(text, /fixed in: 1\.4\.2 {2}CVSS 7\.5/);
  assert.match(text, /tiny-lib@0\.2\.0 .*\[KNOWN EXPLOITED\]/);
  assert.match(text, /Result: FAIL \(fail on: high\)/);
  assert.match(text, /not an audit/);
  // One batched OSV query with each name@version once.
  assert.equal(h.calls.osv.length, 1);
  assert.equal(h.calls.osv[0].length, 4);
});

test('known exploited findings fail at every threshold except none', async () => {
  const onlyKev = { records: [RECORDS.exploited] };
  for (const level of ['critical', 'high', 'moderate', 'low', 'any']) {
    assert.equal(await runAudit(['--fail-on', level], harness(onlyKev).io), EXIT_FINDINGS, level);
  }
  assert.equal(await runAudit(['--fail-on', 'none'], harness(onlyKev).io), EXIT_OK);
  // Without KEV the same LOW finding passes the default high threshold.
  assert.equal(await runAudit(['--no-kev'], harness(onlyKev).io), EXIT_OK);
});

test('thresholds compare severity, and low findings pass at high', async () => {
  const lowOnly = { records: [RECORDS.low] };
  assert.equal(await runAudit([], harness(lowOnly).io), EXIT_OK);
  assert.equal(await runAudit(['--fail-on', 'low'], harness(lowOnly).io), EXIT_FINDINGS);
  assert.equal(await runAudit(['--fail-on', 'critical'], harness({ records: [RECORDS.high] }).io), EXIT_OK);
});

test('--omit-dev skips development-only packages entirely', async () => {
  const h = harness({ records: [RECORDS.low] });
  assert.equal(await runAudit(['--omit-dev', '--fail-on', 'any', '--json'], h.io), EXIT_OK);
  const report = JSON.parse(h.out());
  assert.equal(report.scannedPackages, 3);
  assert.equal(report.findingCount, 0);
  assert.equal(h.calls.osv[0].some((p) => p.name === 'dev-only-lib'), false);
});

test('--json and --output produce the same machine-readable report', async () => {
  const h = harness();
  assert.equal(await runAudit(['--json', '--output', 'report.json'], h.io), EXIT_FINDINGS);
  const report = JSON.parse(h.out());
  assert.deepEqual(JSON.parse(h.written['report.json']), report);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.complete, true);
  assert.equal(report.requiresHumanReview, true);
  assert.deepEqual(report.bySeverity, { critical: 0, high: 1, moderate: 0, low: 2, unknown: 0 });
  assert.equal(report.knownExploitedCount, 1);
  assert.equal(report.blockingCount, 2);
  assert.equal(report.findings[0].package, 'tiny-lib', 'known exploited sorts first');
  assert.equal(report.kev.catalogVersion, '2026.11.25');
  assert.deepEqual(report.nvd, { queriedCves: 2, matchedRecords: 2 });
});

test('failed NVD or KEV lookups make the scan incomplete, never clean', async () => {
  const nvd = harness({ records: [RECORDS.high], nvdFails: true });
  assert.equal(await runAudit(['--fail-on', 'none'], nvd.io), EXIT_INCOMPLETE);
  assert.match(nvd.out(), /Incomplete: NVD CVE-0000-0001 failed \(AMETHERIAN_HTTP_STATUS\)/);
  assert.match(nvd.out(), /Result: INCOMPLETE/);

  const kev = harness({ records: [], kev: new Error('down') });
  assert.equal(await runAudit([], kev.io), EXIT_INCOMPLETE);

  const future = harness({ records: [], kev: { ...catalog, released: '2027-01-01T00:00:00Z' } });
  assert.equal(await runAudit([], future.io), EXIT_INCOMPLETE);

  // Skipping a source on purpose is not an error.
  assert.equal(await runAudit(['--no-kev', '--no-nvd'], harness({ records: [] }).io), EXIT_OK);
});

test('advisory text cannot inject terminal escape sequences', async () => {
  const hostile = {
    ...RECORDS.high,
    summary: 'pwn\u001b]8;;https://evil.example\u0007click\u001b]8;;\u0007 \u001b[2J\u001b[31mred\u001b[0m\r\nfake: PASS‮',
  };
  const h = harness({ records: [hostile] });
  await runAudit(['--no-kev'], h.io);
  const text = h.out();
  assert.equal(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‮]/.test(text), false, 'no control characters reach the terminal');
  assert.match(text, /pwnclick red fake: PASS/);
  assert.equal(sanitizeForTerminal('a\u001bPq#0\u001b\\b').includes('\u001b'), false, 'DCS sequences are removed');
  assert.equal(sanitizeForTerminal('x\u009b31my'), 'x31my', 'C1 CSI is removed');
  assert.equal(sanitizeForTerminal(null), '');
});

test('offline advisories come from a file with file provenance', async () => {
  const h = harness({ files: { 'package-lock.json': LOCK, 'osv.json': JSON.stringify({ vulns: [RECORDS.high] }) } });
  h.io.createOsvClient = () => { throw new Error('must not query OSV'); };
  assert.equal(await runAudit(['--advisories', 'osv.json', '--no-kev', '--no-nvd', '--json'], h.io), EXIT_FINDINGS);
  const report = JSON.parse(h.out());
  assert.equal(report.findings[0].provenance.source, 'file:osv.json');
  assert.deepEqual(report.sources, [{ source: 'file', path: 'osv.json', records: 1 }]);
});

test('usage and input errors exit 2 with a message', async () => {
  for (const argv of [['--fail-on', 'severe'], ['--bogus'], ['a.json', 'b.json'], ['--max-age-hours', '0']]) {
    const h = harness();
    assert.equal(await runAudit(argv, h.io), EXIT_INCOMPLETE, argv.join(' '));
    assert.match(h.err(), /Usage: ametherian-audit/);
  }
  const missing = harness({ files: {} });
  assert.equal(await runAudit([], missing.io), EXIT_INCOMPLETE);
  assert.match(missing.err(), /ENOENT/);

  const empty = harness({ files: { 'package-lock.json': lockfile({}) } });
  assert.equal(await runAudit([], empty.io), EXIT_INCOMPLETE);
  assert.match(empty.err(), /refusing to report a clean scan \[AMETHERIAN_CONFIG\]/);

  const v1 = harness({ files: { 'package-lock.json': JSON.stringify({ lockfileVersion: 1, dependencies: {} }) } });
  assert.equal(await runAudit([], v1.io), EXIT_INCOMPLETE);

  const help = harness();
  assert.equal(await runAudit(['--help'], help.io), EXIT_OK);
  assert.match(help.out(), /Exit status: 0 below the threshold/);
});

test('the bin runs offline against this repository lockfile', () => {
  const bin = fileURLToPath(new URL('../bin/ametherian-audit.js', import.meta.url));
  const lock = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));
  const empty = fileURLToPath(new URL('./fixtures/empty-advisories.json', import.meta.url));
  const run = spawnSync(process.execPath, [bin, lock, '--advisories', empty, '--no-kev', '--no-nvd'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /No matching advisories found\./);
  assert.match(run.stdout, /Result: PASS/);
});
