/**
 * `ametherian-audit`: audit an npm lockfile against OSV, flag CVEs in CISA
 * KEV and enrich CVEs with NIST NVD metadata, then print a report.
 *
 * Everything with side effects (files, network clients, output, the clock)
 * is injected so the whole command runs offline in tests. The tool never
 * edits manifests or lockfiles. Querying OSV and NVD discloses package names
 * and versions to those services (docs/threat-models/security.md V9).
 */
import { parseArgs } from 'node:util';
import { ConfigError } from '@foulfoxhacks/ametherian-core';
import { parseJson } from '@foulfoxhacks/ametherian-schema';
import { normalizeOsv, packagesFromLockfile, auditLockfile } from './advisories.js';
import { annotateWithKev } from './kev.js';
import { createOsvClient } from './osv.js';
import { createKevClient } from './kev.js';
import { createNvdClient } from './nvd.js';

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_INCOMPLETE = 2;

const SEVERITIES = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN'];
const FAIL_ON = ['critical', 'high', 'moderate', 'low', 'any', 'none'];
const MAX_LOCKFILE_BYTES = 50_000_000;
const MAX_ADVISORY_FILE_BYTES = 64 * 1024 * 1024;
const OSV_BATCH = 1000;

export const USAGE = `Usage: ametherian-audit [lockfile] [options]

Audit an npm package-lock.json (v2 or v3) against OSV advisories. CVEs are
checked against CISA Known Exploited Vulnerabilities and enriched from NIST NVD.

Arguments:
  lockfile               Path to the lockfile (default: package-lock.json)

Options:
  --fail-on <level>      critical | high | moderate | low | any | none (default: high).
                         Known exploited findings fail at every level except none.
  --omit-dev             Ignore packages installed only for development
  --json                 Print the full JSON report instead of text
  --output <file>        Also write the JSON report to <file> (mode 0600)
  --advisories <file>    Use OSV records from a JSON file instead of querying OSV
  --no-kev               Skip the CISA KEV catalog
  --no-nvd               Skip NIST NVD enrichment
  --max-age-hours <n>    Mark advisories older than this as stale (default: 24)
  -h, --help             Show this help

Environment:
  NVD_API_KEY            NVD API key (raises the NVD rate limit)

Exit status: 0 below the threshold, 1 findings at or above it, 2 incomplete
intelligence or a usage error. A clean result is not an audit: findings and
non-findings both need human review.
`;

/**
 * Remove terminal control sequences and control characters from untrusted
 * advisory text before printing it (ANSI/OSC escape injection).
 * @param {unknown} value
 */
export function sanitizeForTerminal(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-_]?/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      'fail-on': { type: 'string', default: 'high' },
      'omit-dev': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      output: { type: 'string' },
      advisories: { type: 'string' },
      'no-kev': { type: 'boolean', default: false },
      'no-nvd': { type: 'boolean', default: false },
      'max-age-hours': { type: 'string', default: '24' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const problems = [];
  if (positionals.length > 1) problems.push('only one lockfile may be given');
  const failOn = values['fail-on'].toLowerCase();
  if (!FAIL_ON.includes(failOn)) problems.push(`--fail-on must be one of ${FAIL_ON.join(', ')}`);
  const maxAgeHours = Number(values['max-age-hours']);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0 || maxAgeHours > 24 * 365) problems.push('--max-age-hours must be a positive number of hours');
  if (problems.length) throw new ConfigError(`Invalid arguments: ${problems.join('; ')}`, { problems });
  return {
    help: values.help,
    lockfile: positionals[0] ?? 'package-lock.json',
    failOn,
    omitDev: values['omit-dev'],
    json: values.json,
    output: values.output ?? null,
    advisoriesFile: values.advisories ?? null,
    kev: !values['no-kev'],
    nvd: !values['no-nvd'],
    maxAgeMs: maxAgeHours * 60 * 60 * 1000,
  };
}

function blocking(finding, failOn) {
  if (failOn === 'none') return false;
  if (finding.knownExploited) return true;
  if (failOn === 'any') return true;
  const limit = SEVERITIES.indexOf(failOn.toUpperCase());
  const rank = SEVERITIES.indexOf(finding.severity);
  return rank !== -1 && rank <= limit && finding.severity !== 'UNKNOWN';
}

function loadAdvisoryFile(text, file, now) {
  const data = parseJson(text, { maxBytes: MAX_ADVISORY_FILE_BYTES, maxDepth: 32 });
  const records = Array.isArray(data) ? data : data?.vulns;
  if (!Array.isArray(records)) {
    throw new ConfigError('Advisory file must be a JSON array of OSV records or an object with "vulns"', { problems: ['advisories: not an array'] });
  }
  const provenance = { source: `file:${file}`, retrievedAt: new Date(now()).toISOString(), url: `file:${file}`, confidence: 'medium' };
  return records.map((record) => normalizeOsv(record, provenance));
}

/**
 * Build the audit report. Exposed for programmatic use; `runAudit` wraps it
 * with argument parsing and output.
 *
 * @param {object} options parsed options (see parse())
 * @param {object} io injected dependencies
 */
export async function buildAuditReport(options, io) {
  const now = io.now ?? Date.now;
  const lockText = await io.readFile(options.lockfile);
  if (typeof lockText !== 'string' || Buffer.byteLength(lockText) > MAX_LOCKFILE_BYTES) {
    throw new ConfigError(`Lockfile is larger than ${MAX_LOCKFILE_BYTES} bytes`, { problems: ['lockfile: too large'] });
  }
  const installed = packagesFromLockfile(lockText).filter((pkg) => !(options.omitDev && pkg.dev));
  if (installed.length === 0) {
    throw new ConfigError('Lockfile lists no installed npm packages; refusing to report a clean scan', { problems: ['packages: none'] });
  }
  const intelligenceErrors = [];
  const sources = [];

  let advisories;
  if (options.advisoriesFile) {
    advisories = loadAdvisoryFile(await io.readFile(options.advisoriesFile), options.advisoriesFile, now);
    sources.push({ source: 'file', path: options.advisoriesFile, records: advisories.length });
  } else {
    const osv = io.createOsvClient();
    try {
      const unique = [...new Map(installed.map((p) => [`${p.name}@${p.version}`, { ecosystem: 'npm', name: p.name, version: p.version }])).values()];
      const byId = new Map();
      for (let offset = 0; offset < unique.length; offset += OSV_BATCH) {
        for (const advisory of await osv.queryBatch(unique.slice(offset, offset + OSV_BATCH))) byId.set(advisory.id, advisory);
      }
      advisories = [...byId.values()];
      sources.push({ source: 'osv', queried: unique.length, records: advisories.length });
    } finally {
      await osv.close?.();
    }
  }

  // Match against the filtered package list so --omit-dev also limits findings.
  const lockObject = parseJson(lockText, { maxBytes: MAX_LOCKFILE_BYTES, maxDepth: 32 });
  if (options.omitDev) {
    lockObject.packages = Object.fromEntries(Object.entries(lockObject.packages).filter(([, meta]) => !(meta && meta.dev === true)));
  }
  let report = auditLockfile(lockObject, advisories, { now, maxAgeMs: options.maxAgeMs });

  let kev = null;
  if (options.kev) {
    const client = io.createKevClient();
    try {
      const catalog = await client.fetchCatalog();
      const releasedAt = Date.parse(catalog.released);
      if (!Number.isFinite(releasedAt) || releasedAt - now() > 60 * 60 * 1000) {
        throw new ConfigError(`CISA KEV catalog has an invalid or future release time (${catalog.released})`, { problems: ['kev: released'] });
      }
      report = annotateWithKev(report, catalog);
      kev = { catalogVersion: catalog.version, released: catalog.released, count: catalog.count, retrievedAt: catalog.provenance.retrievedAt };
    } catch (error) {
      intelligenceErrors.push({ source: 'KEV', code: error?.code ?? 'KEV_LOOKUP_FAILED' });
    } finally {
      await client.close?.();
    }
  }

  const cves = [...new Set(report.findings.flatMap((f) => f.aliases ?? []).filter((a) => /^CVE-\d{4}-\d{4,}$/.test(a)))].sort();
  const nvdById = new Map();
  if (options.nvd && cves.length) {
    const client = io.createNvdClient();
    try {
      for (const cve of cves) {
        try {
          const record = await client.getCve(cve);
          if (record) nvdById.set(record.id, record);
        } catch (error) {
          intelligenceErrors.push({ source: 'NVD', id: cve, code: error?.code ?? 'NVD_LOOKUP_FAILED' });
        }
      }
    } finally {
      await client.close?.();
    }
  }

  const findings = report.findings.map((finding) => Object.freeze({
    ...finding,
    knownExploited: finding.knownExploited ?? null,
    nvd: (finding.aliases ?? []).map((alias) => nvdById.get(alias)).find(Boolean) ?? null,
    blocking: blocking({ ...finding, knownExploited: finding.knownExploited ?? null }, options.failOn),
  }));

  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s.toLowerCase(), findings.filter((f) => f.severity === s).length]));
  return Object.freeze({
    schemaVersion: 1,
    generatedAt: new Date(now()).toISOString(),
    lockfile: options.lockfile,
    omitDev: options.omitDev,
    failOn: options.failOn,
    scannedPackages: report.scanned,
    advisoryCount: report.advisories,
    findingCount: findings.length,
    bySeverity,
    knownExploitedCount: findings.filter((f) => f.knownExploited).length,
    staleCount: findings.filter((f) => f.stale).length,
    blockingCount: findings.filter((f) => f.blocking).length,
    sources,
    kev,
    nvd: options.nvd ? { queriedCves: cves.length, matchedRecords: nvdById.size } : null,
    intelligenceErrors,
    complete: intelligenceErrors.length === 0,
    findings: Object.freeze(findings),
    requiresHumanReview: true,
  });
}

/** Plain-text report. All advisory text is sanitized before printing. */
export function formatReport(report) {
  const t = sanitizeForTerminal;
  const lines = [`Ametherian lockfile audit: ${t(report.lockfile)}${report.omitDev ? ' (production packages only)' : ''}`];
  lines.push(`Scanned ${report.scannedPackages} packages against ${report.advisoryCount} advisories.`);
  if (report.kev) lines.push(`CISA KEV catalog ${t(report.kev.catalogVersion)} (${report.kev.count} entries).`);
  if (report.nvd) lines.push(`NVD: ${report.nvd.matchedRecords} of ${report.nvd.queriedCves} CVEs enriched.`);
  lines.push('');
  for (const f of report.findings) {
    const ids = [f.advisoryId, ...(f.aliases ?? []).filter((a) => a !== f.advisoryId)].map(t).join(', ');
    const flags = [f.knownExploited ? 'KNOWN EXPLOITED' : '', f.knownExploited?.ransomware ? 'ransomware' : '', f.stale ? 'stale' : '', f.dev ? 'dev' : ''].filter(Boolean);
    lines.push(`${f.severity.padEnd(9)} ${t(f.package)}@${t(f.version)}  ${ids}${flags.length ? `  [${flags.join(', ')}]` : ''}`);
    if (f.summary) lines.push(`          ${t(f.summary).slice(0, 200)}`);
    const cvss = f.nvd?.cvss ? `  CVSS ${f.nvd.cvss.score} ${t(f.nvd.cvss.vector)}` : '';
    lines.push(`          ${t(f.path)}  fixed in: ${f.fixedIn ? t(f.fixedIn) : 'no fixed version listed'}${cvss}`);
  }
  if (report.findings.length) lines.push('');
  const counts = Object.entries(report.bySeverity).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ');
  lines.push(report.findingCount
    ? `${report.findingCount} finding${report.findingCount === 1 ? '' : 's'}: ${counts}; ${report.knownExploitedCount} known exploited.`
    : 'No matching advisories found.');
  for (const e of report.intelligenceErrors) lines.push(`Incomplete: ${t(e.source)}${e.id ? ` ${t(e.id)}` : ''} failed (${t(e.code)}).`);
  lines.push(`Result: ${verdict(report)} (fail on: ${report.failOn}). Findings and non-findings both need human review; this is not an audit.`);
  return lines.join('\n') + '\n';
}

function verdict(report) {
  if (!report.complete) return 'INCOMPLETE';
  return report.blockingCount ? 'FAIL' : 'PASS';
}

/** Exit status for a report: 2 incomplete, 1 blocking findings, else 0. */
export function exitCodeFor(report) {
  if (!report.complete) return EXIT_INCOMPLETE;
  return report.blockingCount ? EXIT_FINDINGS : EXIT_OK;
}

/**
 * Run the command. Returns the exit status instead of exiting.
 *
 * @param {string[]} argv arguments after the program name
 * @param {{ readFile(path: string): Promise<string>, writeFile?(path: string, text: string): Promise<void>,
 *           stdout(text: string): void, stderr(text: string): void, env?: Record<string, string | undefined>,
 *           now?: () => number, createOsvClient?: Function, createKevClient?: Function, createNvdClient?: Function }} io
 */
export async function runAudit(argv, io) {
  let options;
  try {
    options = parse(argv);
  } catch (error) {
    io.stderr(`${error.message}\n\n${USAGE}`);
    return EXIT_INCOMPLETE;
  }
  if (options.help) {
    io.stdout(USAGE);
    return EXIT_OK;
  }
  const env = io.env ?? {};
  const deps = {
    ...io,
    createOsvClient: io.createOsvClient ?? (() => createOsvClient()),
    createKevClient: io.createKevClient ?? (() => createKevClient()),
    createNvdClient: io.createNvdClient ?? (() => createNvdClient(env.NVD_API_KEY ? { apiKey: env.NVD_API_KEY } : {})),
  };
  let report;
  try {
    report = await buildAuditReport(options, deps);
  } catch (error) {
    const code = error?.code ? ` [${error.code}]` : '';
    io.stderr(`ametherian-audit: ${sanitizeForTerminal(error?.message ?? error)}${code}\n`);
    return EXIT_INCOMPLETE;
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.output) {
    if (!io.writeFile) throw new ConfigError('writeFile is required for --output', { problems: ['io.writeFile: missing'] });
    await io.writeFile(options.output, json);
  }
  io.stdout(options.json ? json : formatReport(report));
  return exitCodeFor(report);
}
