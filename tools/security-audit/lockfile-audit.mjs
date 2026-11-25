#!/usr/bin/env node
/**
 * Audit every installed npm package in package-lock.json against OSV, annotate
 * CVEs present in CISA KEV, and enrich matched CVEs with NIST NVD metadata.
 * This tool never edits package manifests or lockfiles.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packagesFromLockfile, createOsvClient, createKevClient, createNvdClient,
  auditLockfile, annotateWithKev,
} from '@foulfoxhacks/ametherian-security';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lockPath = path.join(root, 'package-lock.json');
const reportPath = path.resolve(root, process.env.SECURITY_REPORT_PATH ?? '.security/lockfile-audit.json');
const maxAgeHours = Number(process.env.SECURITY_MAX_AGE_HOURS ?? 168);
if (!Number.isFinite(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > 720) {
  throw new Error('SECURITY_MAX_AGE_HOURS must be between 1 and 720');
}

const lockText = await fs.readFile(lockPath, 'utf8');
const packages = packagesFromLockfile(lockText);
if (packages.length === 0) throw new Error('Lockfile contains no installed npm packages; refusing to report a false clean scan');

const osv = createOsvClient();
const kev = createKevClient();
const nvd = createNvdClient(process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {});
const intelligenceErrors = [];

try {
  const advisoriesById = new Map();
  for (let offset = 0; offset < packages.length; offset += 1000) {
    const batch = packages.slice(offset, offset + 1000).map((pkg) => ({
      ecosystem: 'npm', name: pkg.name, version: pkg.version,
    }));
    const advisories = await osv.queryBatch(batch);
    for (const advisory of advisories) advisoriesById.set(advisory.id, advisory);
  }

  const catalog = await kev.fetchCatalog();
  const releasedAt = Date.parse(catalog.released);
  const catalogAgeMs = Date.now() - releasedAt;
  if (!Number.isFinite(releasedAt) || catalogAgeMs < -60 * 60 * 1000 || catalogAgeMs > maxAgeHours * 60 * 60 * 1000) {
    throw new Error('CISA KEV catalog is invalid or stale (released=' + catalog.released + ', ageHours=' + (catalogAgeMs / 3600000).toFixed(1) + ')');
  }

  const baseReport = auditLockfile(lockText, [...advisoriesById.values()], { maxAgeMs: 24 * 60 * 60 * 1000 });
  const report = annotateWithKev(baseReport, catalog);

  // OSV performs npm ecosystem/version matching. NVD enriches CVE aliases with
  // CVSS/CWE/status context; it is not treated as an npm range matcher.
  const cveIds = [...new Set(report.findings.flatMap((finding) => finding.aliases ?? [])
    .filter((alias) => /^CVE-\d{4}-\d{4,}$/.test(alias)))].sort();
  const nvdRecords = [];
  for (const cve of cveIds) {
    try {
      const record = await nvd.getCve(cve);
      if (record) nvdRecords.push(record);
    } catch (error) {
      intelligenceErrors.push({ source: 'NVD', id: cve, code: error?.code ?? 'NVD_LOOKUP_FAILED' });
    }
  }

  const nvdById = new Map(nvdRecords.map((record) => [record.id, record]));
  const enrichedFindings = report.findings.map((finding) => ({
    ...finding,
    nvd: (finding.aliases ?? []).map((alias) => nvdById.get(alias)).find(Boolean) ?? null,
  }));

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    lockfile: 'package-lock.json',
    scannedPackages: report.scanned,
    advisoryCount: report.advisories,
    findingCount: enrichedFindings.length,
    knownExploitedCount: report.knownExploited,
    kev: {
      catalogVersion: catalog.version,
      released: catalog.released,
      count: catalog.count,
      retrievedAt: catalog.provenance.retrievedAt,
      ageHours: Number((catalogAgeMs / 3600000).toFixed(2)),
    },
    nvd: { queriedCves: cveIds.length, matchedRecords: nvdRecords.length, apiKeyConfigured: Boolean(process.env.NVD_API_KEY) },
    intelligenceErrors,
    findings: enrichedFindings,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(output, null, 2) + '\n', { mode: 0o600 });

  const kevFindings = enrichedFindings.filter((finding) => finding.knownExploited);
  const highRisk = enrichedFindings.filter((finding) => ['CRITICAL', 'HIGH'].includes(finding.severity));
  console.log('[security] scanned ' + report.scanned + ' packages; ' + report.advisories + ' advisories; ' + enrichedFindings.length + ' affected package findings');
  console.log('[security] CISA KEV matches: ' + kevFindings.length + '; NVD CVEs queried: ' + cveIds.length + '; NVD records: ' + nvdRecords.length);
  console.log('[security] report: ' + path.relative(root, reportPath));

  if (intelligenceErrors.length) {
    console.error('[security] incomplete NVD intelligence: ' + intelligenceErrors.length + ' lookup(s) failed; scan is not considered clean');
    process.exitCode = 2;
  } else if (kevFindings.length || highRisk.length) {
    console.error('[security] release gate blocked: ' + kevFindings.length + ' KEV and ' + highRisk.length + ' high/critical finding(s) require human triage');
    process.exitCode = 1;
  }
} finally {
  await Promise.allSettled([osv.close(), kev.close(), nvd.close()]);
}
