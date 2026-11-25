import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeReleaseClient, compareNodeMinimums } from '../src/index.js';
import { createMockTransport } from '@foulfoxhacks/ametherian-testing';
import { NODE_SECURITY_MINIMUMS, checkNodeVersion } from '@foulfoxhacks/ametherian-core';

// Synthetic release data for tests only.
const index = [
  { version: 'v24.3.1', date: '2026-11-20', lts: 'Krypton', security: false, files: [] },
  { version: 'v24.3.0', date: '2026-11-01', lts: 'Krypton', security: true },
  { version: 'v22.9.9', date: '2026-11-01', lts: 'Jod', security: true },
  { version: 'v20.9.9', date: '2026-03-01', lts: 'Iron', security: true },
];
const schedule = { v20: { start: '2023-04-18', end: '2026-04-30' }, v22: { start: '2024-04-24', end: '2027-04-30' }, v24: { start: '2025-05-06', end: '2028-04-30' } };

function client() {
  return createNodeReleaseClient({
    now: () => Date.parse('2026-11-24T00:00:00Z'),
    transport: createMockTransport({
      'GET https://nodejs.org/dist/index.json': { json: index },
      'GET https://raw.githubusercontent.com/nodejs/Release/main/schedule.json': { json: schedule },
    }),
  });
}

test('status reports latest, latest security and end-of-life per line', async () => {
  const s = await client().status([20, 22, 24]);
  assert.deepEqual({ ...s.lines[24] }, { major: 24, latest: '24.3.1', latestSecurity: '24.3.0', latestSecurityDate: '2026-11-01', lts: 'Krypton', endOfLife: '2028-04-30', isEndOfLife: false });
  assert.equal(s.lines[20].isEndOfLife, true);
  assert.deepEqual(s.provenance.map((p) => p.source), ['nodejs.org', 'raw.githubusercontent.com']);
});

test('compareNodeMinimums flags stale minimums and end-of-life lines', async () => {
  const s = await client().status([20, 22, 24]);
  const r = compareNodeMinimums({ 20: '20.9.9', 22: '22.9.8', 24: '24.3.0' }, s);
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems.map((p) => `${p.major}:${p.kind}`), ['20:end-of-life', '22:minimum-behind']);
  assert.equal(compareNodeMinimums({ 22: '22.9.9', 24: '24.3.0' }, s).ok, true);
});

test('NODE_SECURITY_MINIMUMS covers only maintained LTS lines and the running runtime is checked against it', () => {
  assert.deepEqual(Object.keys(NODE_SECURITY_MINIMUMS), ['22', '24', '26']);
  const r = checkNodeVersion();
  assert.equal(typeof r.ok, 'boolean');
});

test('release client is host-locked', async () => {
  const c = createNodeReleaseClient({
    transport: createMockTransport({ 'GET https://nodejs.org/dist/index.json': { status: 302, headers: { location: 'https://evil.example/index.json' } } }),
  });
  await assert.rejects(c.status([22]), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
});
