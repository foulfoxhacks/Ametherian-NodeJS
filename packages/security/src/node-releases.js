/**
 * Node.js release intelligence: latest security release per major line
 * (https://nodejs.org/dist/index.json) and end-of-life dates from the
 * Node.js Release Working Group schedule
 * (https://github.com/nodejs/Release/blob/main/schedule.json).
 *
 * Used to keep NODE_SECURITY_MINIMUMS current, because parser and TLS
 * vulnerabilities in Node itself (llhttp, OpenSSL) are inherited by every
 * library. HTTPS-only, host-locked, bounded responses, provenance attached.
 */
import { createHttpClient } from '@foulfoxhacks/ametherian-http';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { validateOptions } from '@foulfoxhacks/ametherian-core';
import { object, string, array, boolean, union, literal, record } from '@foulfoxhacks/ametherian-schema';

const Release = object(
  { version: string({ max: 64 }), date: string({ max: 32 }), lts: union(string({ max: 32 }), literal(false)), security: boolean() },
  { unknownKeys: 'strip' },
);
const Index = array(Release, { max: 5000 });
const Schedule = record(object({ start: string({ max: 32 }), end: string({ max: 32 }), lts: string().optional(), maintenance: string().optional(), codename: string().optional() }, { unknownKeys: 'strip' }), { maxKeys: 200 });

/**
 * @param {{ transport?: Function, now?: () => number }} [options]
 */
export function createNodeReleaseClient(options) {
  const o = validateOptions(options, { transport: { type: 'function' }, now: { type: 'function', default: () => Date.now() } }, { name: 'Node release client options' });
  const dist = createHttpClient({
    baseUrl: 'https://nodejs.org',
    transport: o.transport,
    maxResponseBytes: 16 * 1024 * 1024,
    policy: createDestinationPolicy({ allowedProtocols: ['https:'], allowHosts: ['nodejs.org'] }),
  });
  const raw = createHttpClient({
    baseUrl: 'https://raw.githubusercontent.com',
    transport: o.transport,
    maxResponseBytes: 1024 * 1024,
    policy: createDestinationPolicy({ allowedProtocols: ['https:'], allowHosts: ['raw.githubusercontent.com'] }),
  });
  const provenance = (url) => ({ source: new URL(url).hostname, retrievedAt: new Date(o.now()).toISOString(), url, confidence: 'high' });

  /**
   * Per requested major: latest release, latest security release, LTS name,
   * end-of-life date and whether it is end of life today.
   * @param {number[]} majors
   */
  async function status(majors) {
    const index = (await dist.get('/dist/index.json')).json({ schema: Index, maxDepth: 8 });
    const schedule = (await raw.get('/nodejs/Release/main/schedule.json')).json({ schema: Schedule, maxDepth: 8 });
    const today = new Date(o.now()).toISOString().slice(0, 10);
    const out = {};
    for (const major of majors) {
      // Only final releases (vX.Y.Z); the index can also carry pre-release or nightly tags.
      const line = index.filter((r) => /^v\d+\.\d+\.\d+$/.test(r.version) && r.version.startsWith(`v${major}.`));
      const latest = line[0] ?? null;
      const security = line.find((r) => r.security) ?? null;
      const sched = schedule[`v${major}`] ?? null;
      out[major] = Object.freeze({
        major,
        latest: latest?.version.slice(1) ?? null,
        latestSecurity: security?.version.slice(1) ?? null,
        latestSecurityDate: security?.date ?? null,
        lts: latest?.lts || null,
        endOfLife: sched?.end ?? null,
        isEndOfLife: Boolean(sched?.end && sched.end <= today),
      });
    }
    return Object.freeze({
      lines: Object.freeze(out),
      provenance: Object.freeze([provenance('https://nodejs.org/dist/index.json'), provenance('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json')]),
    });
  }

  return Object.freeze({ status, close: () => (dist.close(), raw.close()) });
}

/**
 * Compare documented minimums with live release status. Returns problems to
 * act on (raise a minimum, drop an end-of-life line). Pure function.
 * @param {Record<string, string>} minimums
 * @param {{ lines: Record<string, { latestSecurity: string | null, isEndOfLife: boolean, endOfLife: string | null }> }} status
 */
export function compareNodeMinimums(minimums, status) {
  const cmp = (a, b) => {
    const x = a.split('.').map(Number);
    const y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  const problems = [];
  for (const [major, min] of Object.entries(minimums)) {
    const line = status.lines[major];
    if (!line) {
      problems.push({ major: Number(major), kind: 'unknown-line', detail: 'no release data' });
      continue;
    }
    if (line.isEndOfLife) problems.push({ major: Number(major), kind: 'end-of-life', detail: `ended ${line.endOfLife}` });
    if (line.latestSecurity && cmp(min, line.latestSecurity) < 0) {
      problems.push({ major: Number(major), kind: 'minimum-behind', detail: `${min} < security release ${line.latestSecurity}` });
    }
  }
  return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems) });
}

