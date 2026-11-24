/**
 * OSV API adapter (https://google.github.io/osv.dev/api/).
 *
 * Fetches advisories through ametherian-http with an HTTPS-only policy
 * restricted to the OSV API host, bounded responses, and provenance on
 * every record. Querying discloses package names/versions to the service
 * (docs/threat-models/security.md V9). Results inform human review only.
 */
import { createHttpClient } from '@foulfoxhacks/ametherian-http';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { validateOptions } from '@foulfoxhacks/ametherian-core';
import { object, string, array, unknown } from '@foulfoxhacks/ametherian-schema';
import { normalizeOsv } from './advisories.js';

export const OSV_API = 'https://api.osv.dev';

const QueryResponse = object({ vulns: array(unknown(), { max: 5000 }).optional(), next_page_token: string().optional() }, { unknownKeys: 'strip' });
const BatchResponse = object(
  {
    results: array(
      object({ vulns: array(object({ id: string({ max: 200 }), modified: string().optional() }, { unknownKeys: 'strip' }), { max: 5000 }).optional(), next_page_token: string().optional() }, { unknownKeys: 'strip' }),
      { max: 1000 },
    ),
  },
  { unknownKeys: 'strip' },
);

/**
 * @param {{ baseUrl?: string, client?: object, transport?: Function, now?: () => number,
 *           timeoutMs?: number, maxResponseBytes?: number, maxPages?: number }} [options]
 */
export function createOsvClient(options) {
  const o = validateOptions(options, {
    baseUrl: { type: 'string', default: OSV_API },
    client: { type: 'object' },
    transport: { type: 'function' },
    now: { type: 'function', default: () => Date.now() },
    timeoutMs: { type: 'integer', min: 1, default: 30_000 },
    maxResponseBytes: { type: 'integer', min: 1, default: 32 * 1024 * 1024 },
    maxPages: { type: 'integer', min: 1, max: 100, default: 10 },
  }, { name: 'OSV client options' });
  const base = new URL(o.baseUrl);
  const http =
    o.client ??
    createHttpClient({
      baseUrl: base.origin,
      timeoutMs: o.timeoutMs,
      maxResponseBytes: o.maxResponseBytes,
      transport: o.transport,
      // Only HTTPS to the configured advisory host; no downgrade on redirect.
      policy: createDestinationPolicy({ allowedProtocols: ['https:'], allowHosts: [base.hostname] }),
    });

  const provenance = (url) => ({ source: base.hostname, retrievedAt: new Date(o.now()).toISOString(), url, confidence: 'high' });

  /**
   * Advisories affecting one package version (follows pagination up to maxPages).
   * @param {{ ecosystem: string, name: string, version: string }} pkg
   */
  async function queryPackage(pkg) {
    const q = object({ ecosystem: string({ min: 1, max: 100 }), name: string({ min: 1, max: 300 }), version: string({ min: 1, max: 256 }) }).parse(pkg);
    const out = [];
    let pageToken;
    for (let page = 0; page < o.maxPages; page++) {
      const body = { package: { ecosystem: q.ecosystem, name: q.name }, version: q.version, ...(pageToken ? { page_token: pageToken } : {}) };
      const res = await http.post('/v1/query', { json: body, retry: { retries: 2 } });
      const data = res.json({ schema: QueryResponse, maxDepth: 32 });
      for (const v of data.vulns ?? []) out.push(normalizeOsv(v, provenance(`${base.origin}/v1/query`)));
      if (!data.next_page_token) return out;
      pageToken = data.next_page_token;
    }
    return out;
  }

  /** Full advisory by ID. */
  async function getVuln(id) {
    const safeId = string({ min: 1, max: 200, pattern: /^[A-Za-z0-9._:-]+$/ }).parse(id);
    const path = `/v1/vulns/${encodeURIComponent(safeId)}`;
    const res = await http.get(path);
    return normalizeOsv(res.json({ maxDepth: 32 }), provenance(`${base.origin}${path}`));
  }

  /**
   * Advisories for many package versions: one batch query for IDs, then a
   * fetch per unique ID. Returns de-duplicated normalised advisories.
   * @param {Array<{ ecosystem: string, name: string, version: string }>} packages
   */
  async function queryBatch(packages) {
    const list = array(object({ ecosystem: string({ min: 1 }), name: string({ min: 1 }), version: string({ min: 1 }) }, { unknownKeys: 'strip' }), { max: 1000 }).parse(packages);
    if (list.length === 0) return [];
    const res = await http.post('/v1/querybatch', {
      json: { queries: list.map((p) => ({ package: { ecosystem: p.ecosystem, name: p.name }, version: p.version })) },
      retry: { retries: 2 },
    });
    const data = res.json({ schema: BatchResponse, maxDepth: 32 });
    const ids = [...new Set(data.results.flatMap((r) => (r.vulns ?? []).map((v) => v.id)))];
    const advisories = [];
    for (const id of ids) advisories.push(await getVuln(id));
    return advisories;
  }

  return Object.freeze({ queryPackage, queryBatch, getVuln, close: () => http.close?.() });
}
