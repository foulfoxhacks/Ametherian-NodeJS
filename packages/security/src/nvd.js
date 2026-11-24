/**
 * NIST National Vulnerability Database (NVD) CVE API 2.0 adapter
 * (https://nvd.nist.gov/developers/vulnerabilities).
 *
 * HTTPS-only, locked to services.nvd.nist.gov, bounded responses, and
 * spaced requests to respect NVD's public rate limits (about 5 requests per
 * 30 s without an API key, 50 with one). The API key, if any, is sent only
 * in the `apiKey` header and never logged or included in results.
 */
import { createHttpClient } from '@foulfoxhacks/ametherian-http';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { validateOptions, redactUrl } from '@foulfoxhacks/ametherian-core';
import { sleep } from '@foulfoxhacks/ametherian-resilience';
import { object, string, number, array, unknown } from '@foulfoxhacks/ametherian-schema';

export const NVD_API = 'https://services.nvd.nist.gov';
const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

const Cvss = object(
  { cvssData: object({ baseScore: number({ min: 0, max: 10 }), baseSeverity: string({ max: 16 }).optional(), vectorString: string({ max: 200 }), version: string({ max: 8 }) }, { unknownKeys: 'strip' }) },
  { unknownKeys: 'strip' },
);
const NvdResponse = object(
  {
    totalResults: number({ integer: true, min: 0 }),
    vulnerabilities: array(
      object(
        {
          cve: object(
            {
              id: string({ pattern: CVE_ID }),
              published: string({ max: 64 }),
              lastModified: string({ max: 64 }),
              vulnStatus: string({ max: 64 }).optional(),
              descriptions: array(object({ lang: string({ max: 8 }), value: string({ max: 20_000 }) }, { unknownKeys: 'strip' }), { max: 20 }).optional(),
              metrics: object(
                {
                  cvssMetricV40: array(unknown(), { max: 10 }).optional(),
                  cvssMetricV31: array(Cvss, { max: 10 }).optional(),
                  cvssMetricV30: array(Cvss, { max: 10 }).optional(),
                },
                { unknownKeys: 'strip' },
              ).optional(),
              weaknesses: array(object({ description: array(object({ value: string({ max: 64 }) }, { unknownKeys: 'strip' }), { max: 20 }) }, { unknownKeys: 'strip' }), { max: 20 }).optional(),
            },
            { unknownKeys: 'strip' },
          ),
        },
        { unknownKeys: 'strip' },
      ),
      { max: 2000 },
    ),
  },
  { unknownKeys: 'strip' },
);

/**
 * @param {{ apiKey?: string, transport?: Function, client?: object, now?: () => number,
 *           minIntervalMs?: number, sleep?: (ms: number) => Promise<void> }} [options]
 */
export function createNvdClient(options) {
  const o = validateOptions(options, {
    apiKey: { type: 'string', min: 1, max: 200 },
    transport: { type: 'function' },
    client: { type: 'object' },
    now: { type: 'function', default: () => Date.now() },
    minIntervalMs: { type: 'integer', min: 0 },
    sleep: { type: 'function', default: sleep },
  }, { name: 'NVD client options' });
  const minInterval = o.minIntervalMs ?? (o.apiKey ? 700 : 6500);
  const http =
    o.client ??
    createHttpClient({
      baseUrl: NVD_API,
      transport: o.transport,
      timeoutMs: 30_000,
      maxResponseBytes: 16 * 1024 * 1024,
      headers: o.apiKey ? { apikey: o.apiKey } : {},
      stripHeadersOnRedirect: ['apikey'],
      policy: createDestinationPolicy({ allowedProtocols: ['https:'], allowHosts: ['services.nvd.nist.gov'] }),
    });
  let last = -Infinity;

  async function spaced() {
    const wait = last + minInterval - o.now();
    if (wait > 0) await o.sleep(wait);
    last = o.now();
  }

  /**
   * CVE record with CVSS and CWE data, or null if NVD does not know the ID.
   * @param {string} id
   */
  async function getCve(id) {
    const cveId = string({ pattern: CVE_ID }).parse(id);
    await spaced();
    const path = `/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId)}`;
    // 403/429/503 from NVD are retryable (rate limiting); the client honours Retry-After.
    const res = await http.get(path, { retry: { retries: 3, minDelayMs: 6000, maxDelayMs: 30_000 } });
    const data = res.json({ schema: NvdResponse, maxDepth: 32 });
    const v = data.vulnerabilities[0]?.cve;
    if (!v) return null;
    const metric = v.metrics?.cvssMetricV31?.[0] ?? v.metrics?.cvssMetricV30?.[0];
    return Object.freeze({
      id: v.id,
      published: v.published,
      lastModified: v.lastModified,
      status: v.vulnStatus ?? null,
      description: v.descriptions?.find((d) => d.lang === 'en')?.value ?? '',
      cvss: metric
        ? Object.freeze({ version: metric.cvssData.version, score: metric.cvssData.baseScore, severity: metric.cvssData.baseSeverity ?? null, vector: metric.cvssData.vectorString })
        : null,
      cwes: Object.freeze([...new Set((v.weaknesses ?? []).flatMap((w) => w.description.map((d) => d.value)))]),
      provenance: Object.freeze({ source: 'nvd.nist.gov', retrievedAt: new Date(o.now()).toISOString(), url: redactUrl(`${NVD_API}${path}`), confidence: 'high' }),
    });
  }

  return Object.freeze({ getCve, close: () => http.close?.() });
}

/**
 * Compare current advisory summaries against a baseline (see
 * docs/vulnerability-baseline.json). Returns new, withdrawn-since-baseline
 * and updated advisories. Pure function: no I/O.
 *
 * @param {{ advisories: Array<{ ghsa: string, modified?: string }> }} baseline
 * @param {Array<{ ghsa: string, modified?: string, withdrawn?: boolean }>} current
 */
export function compareWithBaseline(baseline, current) {
  const known = new Map(baseline.advisories.map((a) => [a.ghsa, a]));
  const live = new Map(current.filter((c) => !c.withdrawn).map((c) => [c.ghsa, c]));
  const added = [...live.values()].filter((c) => !known.has(c.ghsa));
  const removed = [...known.values()].filter((k) => !live.has(k.ghsa));
  const updated = [...live.values()].filter((c) => known.has(c.ghsa) && c.modified && known.get(c.ghsa).modified && c.modified > known.get(c.ghsa).modified);
  return Object.freeze({ added, removed, updated, ok: added.length === 0 });
}
