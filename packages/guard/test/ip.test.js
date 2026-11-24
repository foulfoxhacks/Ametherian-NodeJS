import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress, ipToBytes } from '../src/ip.js';

test('expands IPv6 forms to 16 bytes', () => {
  assert.deepEqual(ipToBytes('::1'), [...Array(15).fill(0), 1]);
  assert.deepEqual(ipToBytes('::'), Array(16).fill(0));
  assert.deepEqual(ipToBytes('::ffff:127.0.0.1').slice(10), [0xff, 0xff, 127, 0, 0, 1]);
  assert.deepEqual(ipToBytes('[fe80::1%eth0]').slice(0, 2), [0xfe, 0x80]);
  assert.deepEqual(ipToBytes('1:2:3:4:5:6:7:8'), [0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8]);
  assert.deepEqual(ipToBytes('1::8').slice(14), [0, 8]);
  assert.equal(ipToBytes('example.com'), null);
});

const cases = {
  public: ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:0808:0808::1'],
  unspecified: ['0.0.0.0', '0.1.2.3', '::'],
  loopback: ['127.0.0.1', '127.255.255.254', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:0001::'],
  private: ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', 'fec0::1', '64:ff9b:1::1', '::ffff:10.1.2.3'],
  'link-local': ['169.254.169.254', '169.254.0.1', 'fe80::1', '[fe80::1%eth0]', '::ffff:169.254.169.254'],
  'unique-local': ['fc00::1', 'fd00:ec2::254', 'fdff:ffff::1'],
  cgnat: ['100.64.0.1', '100.127.255.255'],
  multicast: ['224.0.0.1', '239.255.255.255', 'ff02::1'],
  broadcast: ['255.255.255.255'],
  documentation: ['192.0.2.1', '198.51.100.7', '203.0.113.9', '2001:db8::1', '3fff::1'],
  benchmarking: ['198.18.0.1', '198.19.255.255'],
  reserved: ['240.0.0.1', '192.0.0.8', '192.88.99.1', '100::1', '2001::1', '::1.2.3.4'],
};

for (const [category, ips] of Object.entries(cases)) {
  test(`classifies ${category}`, () => {
    for (const ip of ips) assert.equal(classifyAddress(ip), category, ip);
  });
}

test('range edges', () => {
  assert.equal(classifyAddress('172.15.255.255'), 'public');
  assert.equal(classifyAddress('172.32.0.0'), 'public');
  assert.equal(classifyAddress('100.63.255.255'), 'public');
  assert.equal(classifyAddress('100.128.0.0'), 'public');
  assert.equal(classifyAddress('11.0.0.0'), 'public');
  assert.equal(classifyAddress('223.255.255.255'), 'public');
  assert.equal(classifyAddress('fbff::1'), 'public');
  assert.equal(classifyAddress('fe7f::1'), 'public');
});

test('non-IP input returns null', () => {
  for (const v of ['localhost', '', '1.2.3', '256.1.1.1', '::g', '01.2.3.4']) {
    assert.equal(classifyAddress(v), null, v);
  }
});
