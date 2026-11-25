/**
 * CISA Known Exploited Vulnerabilities (KEV) catalog adapter
 * (https://www.cisa.gov/known-exploited-vulnerabilities-catalog).
 *
 * KEV lists CVEs with evidence of active exploitation. Ametherian uses it to
 * flag lockfile findings that are being exploited in the wild, which is the
 * strongest signal for what to fix first. HTTPS-only, host-locked to
 * www.cisa.gov, bounded response, schema-checked, provenance attached.
 */
import { createHttpClient } from '@foulfoxhacks/ametherian-http';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { validateOptions } from '@foulfoxhacks/ametherian-core';
import { object, string, number, array } from '@foulfoxhacks/ametherian-schema';

export const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

const Entry = object(
  {
    cveID: string({ pattern: CVE_ID }),
    vendorProject: string({ max: 300 }),
    product: string({ max: 300 }),
    vulnerabilityName: string({ max: 1000 }),
    dateAdded: string({ max: 32 }),
    shortDescription: string({ max: 10_000 }).optional(),
    requiredAction: string({ max: 10_000 }).optional(),
    dueDate: string({ max: 32 }).optional(),
    knownRansomwareCampaignUse: string({ max: 32 }).optional(),
    cwes: array(string({ max: 32 }), { max: 50 }).optional(),
  },
  { unknownKeys: 'strip' },
);
const Catalog = object(
  {
    title: string({ max: 300 }).optional(),
    catalogVersion: string({ max: 64 }),
    dateReleased: string({ max: 64 }),
    count: number({ integer: true, min: 0 }),
    vulnerabilities: array(Entry, { max: 100_000 }),
  },
  { unknownKeys: 'strip' },
);

/**
 * @param {{ transport?: Function, now?: () => number, maxResponseBytes?: number }} [options]
 */
export function createKevClient(options) {
  const o = validateOptions(options, {
    transport: { type: 'function' },
    now: { type: 'function', default: () => Date.now() },
    maxResponseBytes: { type: 'integer', min: 1, default: 32 * 1024 * 1024 },
  }, { name: 'KEV client options' });
  const url = new URL(KEV_URL);
  const http = createHttpClient({
    baseUrl: url.origin,
    transport: o.transport,
    timeoutMs: 60_000,
    maxResponseBytes: o.maxResponseBytes,
    policy: createDestinationPolicy({ allowedProtocols: ['https:'], allowHosts: [url.hostname] }),
  });

  /**
   * Download and validate the catalog. Returns a lookup by CVE id.
   */
  async function fetchCatalog() {
    const res = await http.get(url.pathname, { retry: { retries: 2 } });
    const data = res.json({ schema: Catalog, maxDepth: 8 });
    const byCve = new Map();
    for (const v of data.vulnerabilities) {
      byCve.set(v.cveID, Object.freeze({
        cve: v.cveID,
        vendor: v.vendorProject,
        product: v.product,
        name: v.vulnerabilityName,
        dateAdded: v.dateAdded,
        dueDate: v.dueDate ?? null,
        ransomware: v.knownRansomwareCampaignUse === 'Known',
        cwes: Object.freeze([...(v.cwes ?? [])]),
      }));
    }
    return Object.freeze({
      version: data.catalogVersion,
      released: data.dateReleased,
      count: data.count,
      get: (cve) => byCve.get(cve) ?? null,
      has: (cve) => byCve.has(cve),
      size: byCve.size,
      provenance: Object.freeze({ source: url.hostname, retrievedAt: new Date(o.now()).toISOString(), url: KEV_URL, confidence: 'high' }),
    });
  }

  return Object.freeze({ fetchCatalog, close: () => http.close() });
}

/**
 * Mark lockfile-audit findings whose advisory aliases include a CVE in the
 * KEV catalog, and sort exploited findings first. Pure function.
 *
 * @param {{ findings: readonly object[] }} report result of auditLockfile()
 * @param {{ get(cve: string): object | null, version: string, provenance: object }} catalog
 */
export function annotateWithKev(report, catalog) {
  const findings = report.findings.map((f) => {
    const hit = (f.aliases ?? []).map((a) => catalog.get(a)).find(Boolean) ?? null;
    return Object.freeze({ ...f, knownExploited: hit ? Object.freeze({ ...hit, catalogVersion: catalog.version, provenance: catalog.provenance }) : null });
  });
  findings.sort((a, b) => Number(Boolean(b.knownExploited)) - Number(Boolean(a.knownExploited)));
  return Object.freeze({ ...report, findings: Object.freeze(findings), knownExploited: findings.filter((f) => f.knownExploited).length });
}
