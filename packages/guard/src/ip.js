/**
 * IP address parsing and classification against IANA special-purpose ranges.
 * See docs/threat-models/guard.md (T1–T3).
 */
// Pure JavaScript IP validation (no node:net), so the guard runs on Node.js,
// Cloudflare Workers, Deno and browsers. Matches node:net isIPv4/isIPv6, which
// test/ip-validate.test.js checks against Node's own implementation.
const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEX = /^[0-9a-fA-F]{1,4}$/;

/** @param {string} s */
export function isIPv4(s) {
  return typeof s === 'string' && V4.test(s);
}

/** @param {string} s */
export function isIPv6(s) {
  if (typeof s !== 'string' || s.length > 64 || s.length < 2) return false;
  let addr = s;
  const zone = addr.indexOf('%');
  if (zone !== -1) {
    // Zone id: any non-empty run of characters without '%'.
    if (zone === addr.length - 1 || addr.indexOf('%', zone + 1) !== -1) return false;
    addr = addr.slice(0, zone);
  }
  let groupsNeeded = 8;
  const lastColon = addr.lastIndexOf(':');
  if (lastColon !== -1 && addr.indexOf('.', lastColon) !== -1) {
    if (!isIPv4(addr.slice(lastColon + 1))) return false;
    addr = `${addr.slice(0, lastColon + 1)}0:0`;
  }
  const doubles = addr.split('::').length - 1;
  if (doubles > 1) return false;
  if (doubles === 1) {
    const [head, tail] = addr.split('::');
    const h = head === '' ? [] : head.split(':');
    const t = tail === '' ? [] : tail.split(':');
    if (![...h, ...t].every((g) => HEX.test(g))) return false;
    return h.length + t.length <= groupsNeeded - 1;
  }
  const groups = addr.split(':');
  return groups.length === groupsNeeded && groups.every((g) => HEX.test(g));
}

/** @typedef {'public'|'unspecified'|'loopback'|'private'|'link-local'|'unique-local'|'cgnat'|'multicast'|'broadcast'|'documentation'|'benchmarking'|'reserved'} AddressCategory */

export const ADDRESS_CATEGORIES = Object.freeze([
  'public',
  'unspecified',
  'loopback',
  'private',
  'link-local',
  'unique-local',
  'cgnat',
  'multicast',
  'broadcast',
  'documentation',
  'benchmarking',
  'reserved',
]);

/** @param {string} ip dotted-quad, already validated */
function v4Bytes(ip) {
  return ip.split('.').map(Number);
}

/**
 * Expand an IPv6 string (validated by net.isIPv6) to 16 bytes.
 * Handles "::" compression, embedded dotted IPv4 tails and zone IDs.
 * @param {string} ip
 * @returns {number[]}
 */
function v6Bytes(ip) {
  let s = ip;
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  let tail = [];
  const lastColon = s.lastIndexOf(':');
  if (s.includes('.', lastColon)) {
    tail = v4Bytes(s.slice(lastColon + 1));
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const [head, rest] = s.split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest === undefined ? [] : rest ? rest.split(':') : [];
  const missing = 8 - headGroups.length - restGroups.length;
  const groups = [...headGroups, ...Array(rest === undefined ? 0 : missing).fill('0'), ...restGroups];
  const bytes = [];
  for (const g of groups) {
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function inV4(b, base, prefix) {
  const ipNum = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  const baseNum = base.split('.').reduce((acc, o) => ((acc << 8) | Number(o)) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipNum & mask) >>> 0) === ((baseNum & mask) >>> 0);
}

/** Ordered: first match wins. */
const V4_RANGES = [
  ['255.255.255.255', 32, 'broadcast'],
  ['0.0.0.0', 8, 'unspecified'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'cgnat'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'reserved'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.88.99.0', 24, 'reserved'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

function classifyV4Bytes(b) {
  for (const [base, prefix, category] of V4_RANGES) {
    if (inV4(b, base, prefix)) return category;
  }
  return 'public';
}

function startsWith(bytes, prefixBytes, bits) {
  for (let i = 0; i < bits; i++) {
    const byte = i >> 3;
    const mask = 0x80 >> (i & 7);
    if ((bytes[byte] & mask) !== (prefixBytes[byte] & mask)) return false;
  }
  return true;
}

function hexPrefix(str) {
  return v6Bytes(str);
}

const V6_RANGES = [
  [hexPrefix('::'), 128, 'unspecified'],
  [hexPrefix('::1'), 128, 'loopback'],
  [hexPrefix('64:ff9b:1::'), 48, 'private'],
  [hexPrefix('100::'), 64, 'reserved'],
  [hexPrefix('2001:db8::'), 32, 'documentation'],
  [hexPrefix('2001::'), 23, 'reserved'],
  [hexPrefix('3fff::'), 20, 'documentation'],
  [hexPrefix('fc00::'), 7, 'unique-local'],
  [hexPrefix('fe80::'), 10, 'link-local'],
  [hexPrefix('fec0::'), 10, 'private'],
  [hexPrefix('ff00::'), 8, 'multicast'],
  [hexPrefix('::'), 96, 'reserved'], // deprecated IPv4-compatible
];

const MAPPED = hexPrefix('::ffff:0:0');
const NAT64 = hexPrefix('64:ff9b::');
const SIX_TO_FOUR = hexPrefix('2002::');

/**
 * Return the IPv4 address embedded in an IPv6 address, if any.
 * @param {number[]} b
 * @returns {number[] | null}
 */
function embeddedV4(b) {
  if (startsWith(b, MAPPED, 96) || startsWith(b, NAT64, 96)) return b.slice(12, 16);
  if (startsWith(b, SIX_TO_FOUR, 16)) return b.slice(2, 6);
  return null;
}

function classifyV6Bytes(b) {
  const v4 = embeddedV4(b);
  if (v4) {
    const inner = classifyV4Bytes(v4);
    return inner;
  }
  for (const [prefix, bits, category] of V6_RANGES) {
    if (startsWith(b, prefix, bits)) return category;
  }
  return 'public';
}

/**
 * Strip URL-style brackets from an IPv6 literal.
 * @param {string} host
 */
export function unbracket(host) {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Classify an IP address string. Returns null if `ip` is not an IP literal.
 * @param {string} ip IPv4 or IPv6 (brackets allowed)
 * @returns {AddressCategory | null}
 */
export function classifyAddress(ip) {
  const s = unbracket(String(ip));
  if (isIPv4(s)) return classifyV4Bytes(v4Bytes(s));
  if (isIPv6(s)) return classifyV6Bytes(v6Bytes(s));
  return null;
}

/**
 * 4 or 16 bytes for an IP literal, or null. Exported for tests and tooling.
 * @param {string} ip
 */
export function ipToBytes(ip) {
  const s = unbracket(String(ip));
  if (isIPv4(s)) return v4Bytes(s);
  if (isIPv6(s)) return v6Bytes(s);
  return null;
}
