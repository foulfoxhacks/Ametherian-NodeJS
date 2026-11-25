import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { isIPv4, isIPv6 } from '../src/ip.js';

const FIXED = [
  '', '0', '1.2.3', '1.2.3.4', '255.255.255.255', '256.0.0.1', '01.2.3.4', '1.2.3.04', '0.0.0.0', '1.2.3.4.5', ' 1.2.3.4', '1.2.3.4 ',
  '::', '::1', '1::', '1::8', '1:2:3:4:5:6:7:8', '1:2:3:4:5:6:7::', '::2:3:4:5:6:7:8', '1:2:3:4:5:6:7:8:9', '1::2::3', ':::', ':1::',
  '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::1.2.3.4', '1:2:3:4:5:6:1.2.3.4', '1:2:3:4:5:6:7:1.2.3.4', '::1.2.3.4', '::1.2.3.04',
  'fe80::1%eth0', 'fe80::1%', 'fe80::1%a%b', 'FE80::ABCD', 'g::1', '12345::1', '1:2:3:4:5:6:7', '[::1]', '::ffff:1.2.3', '1.2.3.4::',
];

function* fuzz(seed, count) {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const alphabet = '0123456789abcdefABCDEF:.%g ';
  for (let i = 0; i < count; i++) {
    const len = 1 + Math.floor(rand() * 24);
    let s = '';
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rand() * alphabet.length)];
    yield s;
  }
}

test('isIPv4 / isIPv6 agree with node:net on fixed edge cases', () => {
  for (const s of FIXED) {
    assert.equal(isIPv4(s), net.isIPv4(s), `isIPv4(${JSON.stringify(s)})`);
    assert.equal(isIPv6(s), net.isIPv6(s), `isIPv6(${JSON.stringify(s)})`);
  }
});

test('isIPv4 / isIPv6 agree with node:net on 20,000 fuzzed strings', () => {
  for (const s of fuzz(7, 20_000)) {
    assert.equal(isIPv4(s), net.isIPv4(s), `isIPv4(${JSON.stringify(s)})`);
    assert.equal(isIPv6(s), net.isIPv6(s), `isIPv6(${JSON.stringify(s)})`);
  }
});

test('non-strings are never IPs', () => {
  for (const v of [undefined, null, 1234, {}, []]) {
    assert.equal(isIPv4(v), false);
    assert.equal(isIPv6(v), false);
  }
});
