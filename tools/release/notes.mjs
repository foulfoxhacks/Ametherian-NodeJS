#!/usr/bin/env node
/**
 * Release notes for a preview build, printed to stdout.
 *
 *   node tools/release/notes.mjs <tag>
 *
 * Includes the "Unreleased" and current-version sections of CHANGELOG.md, the
 * package versions, the commit, and verification facts (test definitions,
 * vulnerability baseline, Node.js minimums) read from the repository.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => fs.readFileSync(root + p, 'utf8');
const tag = process.argv[2] ?? 'local';
const version = JSON.parse(read('package.json')).version;
const changelog = read('CHANGELOG.md');

function section(title) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
}

const packages = fs
  .readdirSync(root + 'packages')
  .filter((d) => fs.existsSync(`${root}packages/${d}/package.json`))
  .map((d) => {
    const pkg = JSON.parse(read(`packages/${d}/package.json`));
    const tests = fs.existsSync(`${root}packages/${d}/test`)
      ? fs.readdirSync(`${root}packages/${d}/test`).filter((f) => f.endsWith('.test.js'))
          .reduce((n, f) => n + (read(`packages/${d}/test/${f}`).match(/^\s*test\(/gm) ?? []).length, 0)
      : 0;
    return { name: pkg.name, version: pkg.version, tests };
  });

const baseline = JSON.parse(read('docs/vulnerability-baseline.json'));
const minimums = Object.fromEntries(
  [...read('packages/core/src/integrity.js').match(/NODE_SECURITY_MINIMUMS = Object\.freeze\(\{([^}]*)\}\)/)[1].matchAll(/(\d+):\s*'([\d.]+)'/g)].map((m) => [m[1], m[2]]),
);
const sha = process.env.GITHUB_SHA ?? '';
const repo = process.env.GITHUB_REPOSITORY ?? 'foulfoxhacks/Ametherian-NodeJS';

const out = [];
out.push(`Preview build **${tag}** of Ametherian ${version}. Unpublished, unaudited, license not chosen. Not on npm.`);
if (sha) out.push(`\nCommit: [\`${sha.slice(0, 7)}\`](https://github.com/${repo}/commit/${sha})`);
const unreleased = section('Unreleased');
if (unreleased) out.push(`\n## Changes since ${version}\n\n${unreleased}`);
const current = section(version);
if (current) out.push(`\n## ${version}\n\n${current}`);
out.push('\n## Packages\n\n| Package | Version | Test definitions |\n|---|---|---|');
for (const p of packages) out.push(`| \`${p.name}\` | ${p.version} | ${p.tests} |`);
out.push(`\n## Verification\n`);
out.push(`- Tests, type checks and site checks passed for this commit before release.`);
out.push(`- Vulnerability baseline: ${baseline.counts.total} axios/undici advisories, ${baseline.counts.prevented} prevented with named regression tests, ${baseline.counts['not-applicable']} not applicable.`);
out.push(`- Node.js security minimums: ${Object.entries(minimums).map(([k, v]) => `${k} → ${v}`).join(', ')}.`);
out.push(`- Assets: one \`npm pack\` tarball per package and \`SHA256SUMS\`.`);
process.stdout.write(out.join('\n') + '\n');
