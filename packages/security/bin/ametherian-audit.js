#!/usr/bin/env node
/** Executable wrapper for runAudit(); see src/cli.js. */
import fs from 'node:fs/promises';
import { runAudit } from '../src/cli.js';

process.exitCode = await runAudit(process.argv.slice(2), {
  readFile: (file) => fs.readFile(file, 'utf8'),
  writeFile: (file, text) => fs.writeFile(file, text, { mode: 0o600 }),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  env: process.env,
});
