#!/usr/bin/env node
/**
 * Repository security gate: runs `ametherian-audit` (packages/security/src/cli.js)
 * on this workspace's package-lock.json and writes the JSON report CI uploads.
 * Blocks on high/critical or known-exploited findings (exit 1) and on
 * incomplete OSV, KEV or NVD intelligence (exit 2). Never edits manifests or
 * lockfiles.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from '@foulfoxhacks/ametherian-security/cli';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lockPath = path.join(root, 'package-lock.json');
const reportPath = path.resolve(root, process.env.SECURITY_REPORT_PATH ?? '.security/lockfile-audit.json');
await fs.mkdir(path.dirname(reportPath), { recursive: true });

process.exitCode = await runAudit([lockPath, '--fail-on', 'high', '--output', reportPath], {
  readFile: (file) => fs.readFile(file, 'utf8'),
  writeFile: (file, text) => fs.writeFile(file, text, { mode: 0o600 }),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  env: process.env,
});
console.log('[security] report: ' + path.relative(root, reportPath));
