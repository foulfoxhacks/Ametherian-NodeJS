import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDestinationPolicy, DESTINATION_BLOCKED } from '../src/policy.js';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

const blocked = (reason) => (err) => {
  assert.equal(err.code, DESTINATION_BLOCKED);
  assert.equal(err.retryable, false);
  assert.equal(err.details.reason, reason);
  return true;
};

test('allows ordinary public URLs', () => {
  const p = createDestinationPolicy();
  assert.equal(p.checkUrl('https://example.com/a').hostname, 'example.com');
  assert.equal(p.checkUrl('http://8.8.8.8/').hostname, '8.8.8.8');
  assert.equal(p.checkUrl('/b', 'https://example.com/a').href, 'https://example.com/b');
});

test('blocks private and special IP literals (T1)', () => {
  const p = createDestinationPolicy();
  for (const url of [
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[fd00:ec2::254]/',
    'http://0.0.0.0/',
    'http://100.64.0.1/',
    'http://224.0.0.1/',
  ]) {
    assert.throws(() => p.checkUrl(url), blocked('blocked-address'), url);
  }
});

test('blocks alternative IPv4 spellings and embedded IPv4 (T2, T3)', () => {
  const p = createDestinationPolicy();
  for (const url of [
    'http://2130706433/',
    'http://0x7f.1/',
    'http://127.1/',
    'http://0177.0.0.1/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[2002:a9fe:a9fe::]/',
  ]) {
    assert.throws(() => p.checkUrl(url), blocked('blocked-address'), url);
  }
});

test('blocks local hostnames (T10) including trailing dot and case', () => {
  const p = createDestinationPolicy();
  for (const url of [
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://metadata.google.internal/',
    'http://printer.local/',
  ]) {
    assert.throws(() => p.checkUrl(url), blocked('blocked-address'), url);
  }
});

test('allowCategories opens specific categories', () => {
  const p = createDestinationPolicy({ allowCategories: ['loopback'] });
  p.checkUrl('http://localhost:3000/');
  p.checkUrl('http://127.0.0.1/');
  assert.throws(() => p.checkUrl('http://10.0.0.1/'), blocked('blocked-address'));
});

test('protocol restrictions (T8)', () => {
  const p = createDestinationPolicy();
  for (const url of ['file:///etc/passwd', 'gopher://example.com/', 'ftp://example.com/', 'data:text/plain,hi', 'javascript:alert(1)']) {
    assert.throws(() => p.checkUrl(url), blocked('protocol'), url);
  }
  const httpsOnly = createDestinationPolicy({ allowedProtocols: ['https:'] });
  assert.throws(() => httpsOnly.checkUrl('http://example.com/'), blocked('protocol'));
});

test('credentials in URL are rejected and redacted from details (T9, T12)', () => {
  const p = createDestinationPolicy();
  assert.throws(
    () => p.checkUrl('https://good.com:hunter2@evil.com/?token=abc'),
    (err) => {
      blocked('credentials')(err);
      assert.ok(!JSON.stringify(err).includes('hunter2'));
      assert.ok(!JSON.stringify(err).includes('abc'));
      return true;
    },
  );
  createDestinationPolicy({ allowCredentials: true }).checkUrl('https://u:p@example.com/');
});

test('invalid URLs do not echo input', () => {
  const p = createDestinationPolicy();
  assert.throws(() => p.checkUrl('not a url secret'), (err) => {
    blocked('invalid-url')(err);
    assert.equal(err.details.url, '[unparseable URL]');
    return true;
  });
});

test('port allow list (T11)', () => {
  const p = createDestinationPolicy({ allowPorts: [443] });
  p.checkUrl('https://example.com/');
  p.checkUrl('https://example.com:443/');
  assert.throws(() => p.checkUrl('https://example.com:6379/'), blocked('port'));
  assert.throws(() => p.checkUrl('http://example.com/'), blocked('port'));
});

test('allow and deny host lists', () => {
  const p = createDestinationPolicy({ allowHosts: ['api.example.com', '*.cdn.example.com'], denyHosts: ['bad.cdn.example.com'] });
  p.checkUrl('https://api.example.com/');
  p.checkUrl('https://img.cdn.example.com/');
  assert.throws(() => p.checkUrl('https://cdn.example.com/'), blocked('host-not-allowed'));
  assert.throws(() => p.checkUrl('https://example.com/'), blocked('host-not-allowed'));
  assert.throws(() => p.checkUrl('https://bad.cdn.example.com/'), blocked('denied-host'));
  assert.throws(() => p.checkUrl('https://evilapi.example.com/'), blocked('host-not-allowed'));
});

test('allowHosts does not bypass address categories', () => {
  const p = createDestinationPolicy({ allowHosts: ['127.0.0.1'] });
  assert.throws(() => p.checkUrl('http://127.0.0.1/'), blocked('blocked-address'));
});

test('redirects are re-checked and downgrades blocked (T6, T7)', () => {
  const p = createDestinationPolicy();
  assert.equal(p.checkRedirect('https://example.com/a', '/b').href, 'https://example.com/b');
  assert.equal(p.checkRedirect('http://example.com/', 'https://example.org/').host, 'example.org');
  assert.throws(() => p.checkRedirect('https://example.com/', 'http://169.254.169.254/'), blocked('blocked-address'));
  assert.throws(() => p.checkRedirect('https://example.com/', 'http://example.com/'), blocked('protocol-downgrade'));
  assert.throws(() => p.checkRedirect('https://example.com/', 'file:///etc/passwd'), blocked('protocol'));
  createDestinationPolicy({ allowDowngrade: true }).checkRedirect('https://example.com/', 'http://example.com/');
});

test('invalid options are ConfigErrors listing every problem', () => {
  assert.throws(
    () => createDestinationPolicy({ allowCategories: ['nope'], allowPorts: [0], allowedProtocols: ['https'], extra: 1 }),
    (err) => {
      assert.equal(err.code, ErrorCodes.CONFIG);
      assert.equal(err.details.problems.length, 4);
      return true;
    },
  );
});

function fakeLookup(answers) {
  return (hostname, options, cb) => {
    assert.equal(options.all, true);
    queueMicrotask(() => {
      const a = answers[hostname];
      if (!a) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
      cb(null, a);
    });
  };
}

function callLookup(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (err, address, family) => (err ? reject(err) : resolve({ address, family })));
  });
}

const answers = {
  'public.test': [{ address: '93.184.215.14', family: 4 }, { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 }],
  'rebind.test': [{ address: '93.184.215.14', family: 4 }, { address: '127.0.0.1', family: 4 }],
  'metadata.test': [{ address: '169.254.169.254', family: 4 }],
  'mapped.test': [{ address: '::ffff:10.0.0.1', family: 6 }],
};

test('lookup returns first address for public names (T4)', async () => {
  const p = createDestinationPolicy({ lookup: fakeLookup(answers) });
  assert.deepEqual(await callLookup(p.lookup, 'public.test', {}), { address: '93.184.215.14', family: 4 });
  assert.deepEqual(await callLookup(p.lookup, 'public.test', 4), { address: '93.184.215.14', family: 4 });
  assert.deepEqual(await callLookup(p.lookup, 'public.test'), { address: '93.184.215.14', family: 4 });
});

test('lookup with all:true returns the list', async () => {
  const p = createDestinationPolicy({ lookup: fakeLookup(answers) });
  const { address } = await callLookup(p.lookup, 'public.test', { all: true });
  assert.equal(address.length, 2);
});

test('lookup rejects if any answer is blocked (T4, T5)', async () => {
  const p = createDestinationPolicy({ lookup: fakeLookup(answers) });
  await assert.rejects(callLookup(p.lookup, 'rebind.test', {}), blocked('blocked-address'));
  await assert.rejects(callLookup(p.lookup, 'metadata.test', { all: true }), (err) => {
    blocked('blocked-address')(err);
    assert.equal(err.details.category, 'link-local');
    assert.equal(err.details.address, '169.254.169.254');
    return true;
  });
  await assert.rejects(callLookup(p.lookup, 'mapped.test', {}), blocked('blocked-address'));
});

test('lookup applies host rules before DNS', async () => {
  let called = false;
  const p = createDestinationPolicy({
    lookup: () => {
      called = true;
    },
    denyHosts: ['public.test'],
  });
  await assert.rejects(callLookup(p.lookup, 'localhost', {}), blocked('blocked-address'));
  await assert.rejects(callLookup(p.lookup, 'public.test', {}), blocked('denied-host'));
  assert.equal(called, false);
});

test('lookup passes through resolver errors and empty answers', async () => {
  const p = createDestinationPolicy({ lookup: fakeLookup({ 'empty.test': [] }) });
  await assert.rejects(callLookup(p.lookup, 'missing.test', {}), { code: 'ENOTFOUND' });
  await assert.rejects(callLookup(p.lookup, 'empty.test', {}), { code: 'ENOTFOUND' });
});

test('lookup handles single-address resolvers', async () => {
  const single = (h, o, cb) => queueMicrotask(() => cb(null, '10.0.0.1', 4));
  const p = createDestinationPolicy({ lookup: single });
  await assert.rejects(callLookup(p.lookup, 'x.test', {}), blocked('blocked-address'));
});
