#!/usr/bin/env node
/**
 * Advisory watcher: queries OSV (GitHub Advisory Database aggregate) for
 * every package in docs/vulnerability-baseline.json, enriches any new
 * advisory with NIST NVD CVSS/CWE data, and exits 1 when an advisory is not
 * yet mapped in tools/advisory-watch/classes.json.
 *
 *   node tools/advisory-watch/watch.mjs [--write-cache <file>]
 *
 * Env: NVD_API_KEY (optional; raises NVD rate limits). GITHUB_STEP_SUMMARY
 * (set by GitHub Actions) receives a Markdown report.
 *
 * The watcher never changes code. A failure means: review the new
 * advisory, add a regression test or a not-applicable reason, map it in
 * classes.json, and rebuild the baseline.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOsvClient, createNvdClient, compareWithBaseline, createNodeReleaseClient, compareNodeMinimums } from '@foulfoxhacks/ametherian-security';
import { NODE_SECURITY_MINIMUMS } from '@foulfoxhacks/ametherian-core';
import { summarize } from './lib.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(fs.readFileSync(`${root}docs/vulnerability-baseline.json`, 'utf8'));
const cacheIdx = process.argv.indexOf('--write-cache');
const cachePath = cacheIdx > -1 ? process.argv[cacheIdx + 1] : null;

const osv = createOsvClient();
const current = [];
const cache = {};
for (const name of baseline.packages) {
  const advisories = await osv.queryAllVersions({ ecosystem: 'npm', name });
  cache[name] = advisories;
  for (const s of summarize(advisories)) current.push({ ...s, package: name });
}
osv.close();
if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(cache));

const result = compareWithBaseline(baseline, current);
const nvd = createNvdClient(process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {});
const enriched = [];
for (const a of result.added) {
  let nvdInfo = null;
  for (const cve of a.cve) {
    try {
      nvdInfo = await nvd.getCve(cve);
    } catch (err) {
      nvdInfo = { error: err.code ?? err.message };
    }
    if (nvdInfo) break;
  }
  enriched.push({ ...a, nvd: nvdInfo });
}
nvd.close();

const lines = [];
lines.push(`# Advisory watch: ${baseline.packages.join(', ')}`);
lines.push('');
lines.push(`Checked ${current.length} advisories against the baseline of ${baseline.counts.total} (generated ${baseline.generatedAt}).`);
lines.push('');
if (enriched.length) {
  lines.push(`## ${enriched.length} new advisory(ies) need review`);
  lines.push('');
  lines.push('| Package | GHSA | CVE | Severity | NVD CVSS | CWE | Summary |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const a of enriched) {
    const cvss = a.nvd?.cvss ? `${a.nvd.cvss.score} (${a.nvd.cvss.severity ?? a.nvd.cvss.version})` : a.nvd?.error ? `error: ${a.nvd.error}` : 'n/a';
    const cwe = a.nvd?.cwes?.join(', ') || 'n/a';
    lines.push(`| ${a.package} | ${a.ghsa} | ${a.cve.join(', ') || 'n/a'} | ${a.severity} | ${cvss} | ${cwe} | ${a.summary.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('Next: decide the weakness class, add a regression test (or a not-applicable reason), map the GHSA id in `tools/advisory-watch/classes.json`, and rebuild the baseline.');
}
if (result.removed.length) {
  lines.push('');
  lines.push(`## ${result.removed.length} baseline advisory(ies) withdrawn or no longer listed`);
  for (const r of result.removed) lines.push(`- ${r.ghsa} (${r.package})`);
}
if (result.updated.length) {
  lines.push('');
  lines.push(`## ${result.updated.length} advisory(ies) modified since the baseline`);
  for (const u of result.updated) lines.push(`- ${u.ghsa} (${u.package}), modified ${u.modified}`);
}
if (result.ok && !result.removed.length) lines.push('No unmapped advisories.');

// Node.js runtime: inherited llhttp/OpenSSL fixes arrive as Node security releases.
const nodeClient = createNodeReleaseClient();
const nodeStatus = await nodeClient.status(Object.keys(NODE_SECURITY_MINIMUMS).map(Number));
nodeClient.close();
const runtime = compareNodeMinimums(NODE_SECURITY_MINIMUMS, nodeStatus);
lines.push('');
lines.push('## Node.js runtime');
lines.push('');
lines.push('| Line | Minimum (core) | Latest security release | LTS | End of life |');
lines.push('|---|---|---|---|---|');
for (const [major, min] of Object.entries(NODE_SECURITY_MINIMUMS)) {
  const l = nodeStatus.lines[major];
  lines.push(`| ${major} | ${min} | ${l?.latestSecurity ?? 'n/a'} (${l?.latestSecurityDate ?? ''}) | ${l?.lts ?? 'no'} | ${l?.endOfLife ?? 'n/a'}${l?.isEndOfLife ? ' (ENDED)' : ''} |`);
}
for (const p of runtime.problems) lines.push(`- **Node ${p.major}: ${p.kind}**: ${p.detail}. Update NODE_SECURITY_MINIMUMS in packages/core/src/integrity.js (and CI/engines for end-of-life lines).`);
if (runtime.ok) lines.push('Runtime minimums are current.');

const report = `${lines.join('\n')}\n`;
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
process.exit(result.ok && runtime.ok ? 0 : 1);
