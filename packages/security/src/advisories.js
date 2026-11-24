/**
 * Vulnerability intelligence: normalise OSV-format advisories with
 * provenance, decide whether a package version is affected, and audit an
 * npm lockfile. Output is a report for human review; nothing here changes
 * code or dependencies.
 *
 * OSV schema: https://ossf.github.io/osv-schema/
 */
import { ConfigError } from '@foulfoxhacks/ametherian-core';
import { object, string, array, record, literal, unknown, parseJson } from '@foulfoxhacks/ametherian-schema';
import { parseSemver, compareSemver } from './semver.js';

const MAX_TEXT = 4_000;
const text = (max = MAX_TEXT) => string().transform((s) => (s.length > max ? `${s.slice(0, max)}…` : s));

const Event = object(
  {
    introduced: string({ max: 256 }).optional(),
    fixed: string({ max: 256 }).optional(),
    last_affected: string({ max: 256 }).optional(),
    limit: string({ max: 256 }).optional(),
  },
  { unknownKeys: 'strip' },
);

const Affected = object(
  {
    package: object({ ecosystem: string({ min: 1, max: 100 }), name: string({ min: 1, max: 300 }), purl: string().optional() }, { unknownKeys: 'strip' }),
    ranges: array(object({ type: literal('SEMVER', 'ECOSYSTEM', 'GIT'), events: array(Event, { max: 200 }), repo: string().optional() }, { unknownKeys: 'strip' }), { max: 100 }).optional(),
    versions: array(string({ max: 256 }), { max: 10_000 }).optional(),
    database_specific: unknown(),
    ecosystem_specific: unknown(),
    severity: unknown(),
  },
  { unknownKeys: 'strip' },
);

const OsvRecord = object(
  {
    id: string({ min: 1, max: 200 }),
    schema_version: string().optional(),
    modified: string({ max: 64 }),
    published: string({ max: 64 }).optional(),
    withdrawn: string({ max: 64 }).optional(),
    aliases: array(string({ max: 200 }), { max: 100 }).optional(),
    related: array(string({ max: 200 }), { max: 100 }).optional(),
    summary: text(500).optional(),
    details: text().optional(),
    severity: array(object({ type: string({ max: 32 }), score: string({ max: 256 }) }, { unknownKeys: 'strip' }), { max: 10 }).optional(),
    affected: array(Affected, { max: 1000 }).optional(),
    references: array(object({ type: string({ max: 32 }), url: string({ max: 2000 }) }, { unknownKeys: 'strip' }), { max: 200 }).optional(),
    database_specific: record(unknown(), { maxKeys: 50 }).optional(),
    credits: unknown(),
  },
  { unknownKeys: 'strip' },
);

const Provenance = object({
  source: string({ min: 1, max: 100 }),
  retrievedAt: string({ min: 1, max: 64 }).refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date'),
  url: string({ max: 2000 }).optional(),
  confidence: literal('high', 'medium', 'low').default('high'),
});

const LEVELS = ['CRITICAL', 'HIGH', 'MODERATE', 'MEDIUM', 'LOW'];

function severityLabel(rec) {
  const db = rec.database_specific?.severity;
  if (typeof db === 'string' && LEVELS.includes(db.toUpperCase())) return db.toUpperCase() === 'MEDIUM' ? 'MODERATE' : db.toUpperCase();
  return 'UNKNOWN';
}

/**
 * Validate and normalise one OSV record, attaching provenance.
 * @param {unknown} raw parsed OSV JSON
 * @param {{ source: string, retrievedAt: string, url?: string, confidence?: 'high'|'medium'|'low' }} provenance
 */
export function normalizeOsv(raw, provenance) {
  const prov = Provenance.parse(provenance);
  const rec = OsvRecord.parse(raw);
  return Object.freeze({
    id: rec.id,
    aliases: Object.freeze([...(rec.aliases ?? [])]),
    summary: rec.summary ?? '',
    severity: severityLabel(rec),
    cvss: Object.freeze((rec.severity ?? []).map((s) => Object.freeze({ ...s }))),
    published: rec.published ?? null,
    modified: rec.modified,
    withdrawn: rec.withdrawn ?? null,
    affected: Object.freeze(
      (rec.affected ?? []).map((a) =>
        Object.freeze({
          ecosystem: a.package.ecosystem,
          name: a.package.name,
          ranges: Object.freeze((a.ranges ?? []).filter((r) => r.type !== 'GIT')),
          versions: Object.freeze([...(a.versions ?? [])]),
        }),
      ),
    ),
    references: Object.freeze((rec.references ?? []).map((r) => r.url)),
    provenance: Object.freeze({ ...prov }),
  });
}

function rangeAffects(range, version) {
  const events = [...range.events].sort((a, b) => {
    const va = a.introduced ?? a.fixed ?? a.last_affected ?? a.limit;
    const vb = b.introduced ?? b.fixed ?? b.last_affected ?? b.limit;
    if (va === '0') return -1;
    if (vb === '0') return 1;
    if (!parseSemver(va) || !parseSemver(vb)) return 0;
    return compareSemver(va, vb);
  });
  let affected = false;
  for (const e of events) {
    if (e.introduced !== undefined) {
      if (e.introduced === '0' || (parseSemver(e.introduced) && compareSemver(version, e.introduced) >= 0)) affected = true;
    } else if (e.fixed !== undefined) {
      if (parseSemver(e.fixed) && compareSemver(version, e.fixed) >= 0) affected = false;
    } else if (e.last_affected !== undefined) {
      if (parseSemver(e.last_affected) && compareSemver(version, e.last_affected) > 0) affected = false;
    } else if (e.limit !== undefined) {
      if (parseSemver(e.limit) && compareSemver(version, e.limit) >= 0) affected = false;
    }
  }
  return affected;
}

/**
 * First `fixed` version greater than `version` across the entry's ranges, if any.
 */
function fixedAfter(entry, version) {
  const fixes = entry.ranges
    .flatMap((r) => r.events.map((e) => e.fixed))
    .filter((f) => f && parseSemver(f) && compareSemver(f, version) > 0)
    .sort(compareSemver);
  return fixes[0] ?? null;
}

/**
 * Is `name@version` in `ecosystem` affected by a normalised advisory?
 * Invalid versions return false with `reason: 'unparseable-version'`.
 */
export function checkAffected(advisory, ecosystem, name, version) {
  if (advisory.withdrawn) return { affected: false, reason: 'withdrawn' };
  if (!parseSemver(version)) return { affected: false, reason: 'unparseable-version' };
  for (const entry of advisory.affected) {
    if (entry.ecosystem !== ecosystem || entry.name !== name) continue;
    if (entry.versions.includes(version)) return { affected: true, fixedIn: fixedAfter(entry, version) };
    for (const range of entry.ranges) {
      if (rangeAffects(range, version)) return { affected: true, fixedIn: fixedAfter(entry, version) };
    }
  }
  return { affected: false };
}

/**
 * Packages (name, version, path) from an npm package-lock v2/v3.
 * @param {string | object} lockfile JSON text (parsed with limits) or object
 */
export function packagesFromLockfile(lockfile) {
  const lock = typeof lockfile === 'string' ? parseJson(lockfile, { maxBytes: 50_000_000, maxDepth: 32 }) : lockfile;
  if (!lock || typeof lock !== 'object' || typeof lock.packages !== 'object' || lock.packages === null) {
    throw new ConfigError('Unsupported lockfile: expected npm package-lock v2 or v3 with "packages"', { problems: ['packages: missing'] });
  }
  const out = [];
  for (const [path, meta] of Object.entries(lock.packages)) {
    if (!path || !meta || typeof meta !== 'object' || meta.link) continue;
    const idx = path.lastIndexOf('node_modules/');
    if (idx === -1) continue;
    const name = meta.name ?? path.slice(idx + 'node_modules/'.length);
    if (typeof meta.version !== 'string') continue;
    out.push({ name, version: meta.version, path, dev: meta.dev === true });
  }
  return out;
}

/**
 * Match lockfile packages against advisories. Every finding carries the
 * advisory's provenance and a `stale` flag when the intelligence is older
 * than `maxAgeMs`. `requiresHumanReview` is always true.
 *
 * @param {string | object} lockfile
 * @param {ReturnType<typeof normalizeOsv>[]} advisories
 * @param {{ now?: () => number, maxAgeMs?: number, ecosystem?: string }} [options]
 */
export function auditLockfile(lockfile, advisories, options = {}) {
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const ecosystem = options.ecosystem ?? 'npm';
  const packages = packagesFromLockfile(lockfile);
  const findings = [];
  for (const pkg of packages) {
    for (const adv of advisories) {
      const result = checkAffected(adv, ecosystem, pkg.name, pkg.version);
      if (!result.affected) continue;
      findings.push(
        Object.freeze({
          advisoryId: adv.id,
          aliases: adv.aliases,
          summary: adv.summary,
          severity: adv.severity,
          package: pkg.name,
          version: pkg.version,
          path: pkg.path,
          dev: pkg.dev,
          fixedIn: result.fixedIn,
          provenance: adv.provenance,
          stale: now() - Date.parse(adv.provenance.retrievedAt) > maxAgeMs,
          requiresHumanReview: true,
        }),
      );
    }
  }
  const order = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3, UNKNOWN: 4 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.package.localeCompare(b.package));
  return Object.freeze({
    scanned: packages.length,
    advisories: advisories.length,
    findings: Object.freeze(findings),
    generatedAt: new Date(now()).toISOString(),
  });
}

