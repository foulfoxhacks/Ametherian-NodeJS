import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDestinationPolicy, DESTINATION_BLOCKED } from '../src/index.js';

let server;
let port;
let hits = 0;

before(async () => {
  server = http.createServer((req, res) => {
    hits++;
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

// Resolver standing in for DNS: a public-looking name that points at loopback.
const resolveToLoopback = (hostname, options, cb) =>
  queueMicrotask(() => cb(null, [{ address: '127.0.0.1', family: 4 }]));

function get(url, agent) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
}

test('real http.Agent refuses a name that resolves to loopback (DNS path)', async () => {
  const policy = createDestinationPolicy({ lookup: resolveToLoopback });
  const agent = new http.Agent({ lookup: policy.lookup });
  const before = hits;
  await assert.rejects(get(`http://svc.test:${port}/`, agent), { code: DESTINATION_BLOCKED });
  assert.equal(hits, before, 'server must not receive the request');
  agent.destroy();
});

test('real http.Agent connects when loopback is explicitly allowed', async () => {
  const policy = createDestinationPolicy({ allowCategories: ['loopback'], lookup: resolveToLoopback });
  const agent = new http.Agent({ lookup: policy.lookup });
  assert.equal(await get(`http://svc.test:${port}/`, agent), 200);
  agent.destroy();
});
