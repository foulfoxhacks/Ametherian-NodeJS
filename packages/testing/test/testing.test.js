import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockTransport,
  createTestServer,
  createFakeClock,
  seededRandom,
  fuzzStrings,
  ADVERSARIAL_STRINGS,
} from '../src/index.js';
import { createHttpClient } from '@foulfoxhacks/ametherian-http';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import { parseJson, object, string } from '@foulfoxhacks/ametherian-schema';
import { createCache } from '@foulfoxhacks/ametherian-cache';
import { ErrorCodes, isAmetherianError } from '@foulfoxhacks/ametherian-core';

test('mock transport drives ametherian-http without network', async () => {
  const transport = createMockTransport({
    'GET /users/1': { json: { name: 'Ana' } },
    'POST https://api.example.com/users': (req) => ({ status: 201, json: { got: JSON.parse(req.body) } }),
  });
  const client = createHttpClient({ baseUrl: 'https://api.example.com', transport });
  assert.deepEqual((await client.get('/users/1')).json(), { name: 'Ana' });
  const created = await client.post('/users', { json: { name: 'Bo' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.json(), { got: { name: 'Bo' } });
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[1].headers['content-type'], 'application/json');
  await assert.rejects(client.get('/missing', { retry: false }), { code: 'MOCK_NO_ROUTE' });
});

test('mock transport still goes through the guard policy', async () => {
  const transport = createMockTransport({ 'GET /': { body: 'x' } });
  const client = createHttpClient({ transport });
  await assert.rejects(client.get('http://10.0.0.1/'), { code: 'AMETHERIAN_DESTINATION_BLOCKED' });
  assert.equal(transport.calls.length, 0);
});

test('mock transport enforces maxResponseBytes and can throw errors', async () => {
  const transport = createMockTransport({ 'GET /big': { body: 'x'.repeat(100) }, 'GET /err': new Error('boom') });
  const client = createHttpClient({ transport, maxResponseBytes: 10, retry: false });
  await assert.rejects(client.get('https://example.com/big'), { code: ErrorCodes.LIMIT_EXCEEDED });
  await assert.rejects(client.get('https://example.com/err'), /boom/);
});

test('test server records requests and closes', async () => {
  const srv = await createTestServer((req, res) => res.end('hi'));
  const client = createHttpClient({ policy: createDestinationPolicy({ allowCategories: ['loopback'] }) });
  assert.equal((await client.get(`${srv.url}/path?q=1`, { headers: { 'x-test': '1' } })).text(), 'hi');
  assert.equal(srv.requests[0].url, '/path?q=1');
  assert.equal(srv.requests[0].headers['x-test'], '1');
  client.close();
  await srv.close();
});

test('fake clock works with cache TTLs', () => {
  const clock = createFakeClock(1000);
  const cache = createCache({ maxEntries: 10, ttlMs: 50, now: clock.now });
  cache.set('k', 1);
  clock.advance(49);
  assert.equal(cache.get('k'), 1);
  clock.advance(1);
  assert.equal(cache.get('k'), undefined);
  assert.equal(clock.date().getTime(), 1050);
  assert.throws(() => clock.advance(-1), RangeError);
});

test('seeded random and fuzzStrings are deterministic', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const f1 = fuzzStrings({ seed: 7, count: 300 });
  const f2 = fuzzStrings({ seed: 7, count: 300 });
  assert.deepEqual(f1, f2);
  assert.equal(f1.length, 300);
  assert.deepEqual(f1.slice(0, ADVERSARIAL_STRINGS.length), [...ADVERSARIAL_STRINGS]);
  assert.notDeepEqual(fuzzStrings({ seed: 8, count: 300 }), f1);
});

test('fuzz: parseJson + schema never throws non-Ametherian errors and never pollutes', () => {
  const User = object({ name: string({ max: 50 }) });
  for (const input of fuzzStrings({ seed: 3, count: 500 })) {
    try {
      parseJson(input, { schema: User, maxBytes: 200_000 });
    } catch (err) {
      assert.ok(isAmetherianError(err), `unexpected ${err?.name}: ${err?.message} for ${JSON.stringify(input).slice(0, 80)}`);
    }
  }
  assert.equal({}.polluted, undefined);
});

test('fuzz: guard checkUrl only throws typed errors', () => {
  const policy = createDestinationPolicy();
  for (const input of fuzzStrings({ seed: 5, count: 500 })) {
    try {
      policy.checkUrl(input);
    } catch (err) {
      assert.ok(isAmetherianError(err), `unexpected ${err?.name} for ${JSON.stringify(input).slice(0, 80)}`);
    }
  }
});
