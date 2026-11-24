/**
 * Test utilities for code built on Ametherian packages.
 */
import http from 'node:http';
import { asyncDispose, LimitExceededError } from '@foulfoxhacks/ametherian-core';

/**
 * A transport for ametherian-http that never touches the network.
 * Routes are matched as "METHOD /path" (query ignored) or "METHOD https://host/path";
 * a handler may be a response object or a function receiving the request.
 *
 * @param {Record<string, object | ((req: object) => object | Promise<object>)>} routes
 */
export function createMockTransport(routes = {}) {
  const calls = [];
  const table = new Map(Object.entries(routes));
  const transport = async (req) => {
    const call = {
      method: req.method,
      url: req.url.href,
      headers: { ...req.headers },
      body: req.body ? new TextDecoder().decode(req.body) : undefined,
    };
    calls.push(call);
    const handler =
      table.get(`${req.method} ${req.url.origin}${req.url.pathname}`) ?? table.get(`${req.method} ${req.url.pathname}`);
    if (!handler) {
      throw Object.assign(new Error(`No mock route for ${req.method} ${req.url.href}`), { code: 'MOCK_NO_ROUTE' });
    }
    const spec = typeof handler === 'function' ? await handler(call) : handler;
    if (spec instanceof Error) throw spec;
    const headers = Object.entries(spec.headers ?? {});
    let body = spec.body ?? '';
    if (spec.json !== undefined) {
      body = JSON.stringify(spec.json);
      if (!headers.some(([k]) => k.toLowerCase() === 'content-type')) headers.push(['content-type', 'application/json']);
    }
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    if (bytes.byteLength > req.maxResponseBytes) {
      throw new LimitExceededError('Mock response exceeded maxResponseBytes', { limit: req.maxResponseBytes, actual: bytes.byteLength, resource: 'response-body' });
    }
    return { status: spec.status ?? 200, statusText: spec.statusText ?? '', headers, body: bytes };
  };
  transport.calls = calls;
  transport.route = (key, handler) => table.set(key, handler);
  return transport;
}

/**
 * Start a real HTTP server on 127.0.0.1 with an ephemeral port.
 * Records every request; supports `await using`.
 *
 * @param {(req: http.IncomingMessage, res: http.ServerResponse) => void} handler
 */
export async function createTestServer(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, headers: { ...req.headers } });
    handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const close = () =>
    new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  return { url: `http://127.0.0.1:${port}`, port, requests, server, close, [asyncDispose]: close };
}

/** Manually advanced clock for code that accepts `now` injection. */
export function createFakeClock(start = 0) {
  let t = start;
  return Object.freeze({
    now: () => t,
    date: () => new Date(t),
    advance(ms) {
      if (!(ms >= 0)) throw new RangeError('advance expects ms >= 0');
      t += ms;
      return t;
    },
    set(ms) {
      t = ms;
    },
  });
}

/** Deterministic PRNG (mulberry32) so fuzz runs are reproducible from a seed. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Known-hostile inputs for parsers, validators and URL handling. */
export const ADVERSARIAL_STRINGS = Object.freeze([
  '',
  ' ',
  '\u0000',
  '\r\nInjected: 1',
  '__proto__',
  'constructor',
  'prototype',
  '{"__proto__":{"polluted":true}}',
  '../../../etc/passwd',
  '..\\..\\windows\\win.ini',
  '%2e%2e%2f',
  '<script>alert(1)</script>',
  "' OR '1'='1",
  '${7*7}',
  '‮',
  '\ud800',
  'ﬀ'.repeat(4),
  'a'.repeat(100_000),
  'http://127.0.0.1/',
  'http://2130706433/',
  'http://[::ffff:127.0.0.1]/',
  'http://169.254.169.254/latest/meta-data/',
  'http://good.com@evil.com/',
  'file:///etc/passwd',
  'javascript:alert(1)',
  '[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[',
  '-1',
  'NaN',
  '1e309',
  '0x7f',
]);

/**
 * Generate `count` fuzz strings: the adversarial corpus first, then random
 * mutations of it (deterministic for a given seed).
 * @param {{ seed?: number, count?: number, maxLength?: number }} [options]
 */
export function fuzzStrings(options = {}) {
  const { seed = 1, count = 200, maxLength = 256 } = options;
  const rand = seededRandom(seed);
  const out = ADVERSARIAL_STRINGS.slice(0, count).map(String);
  const alphabet = ['\u0000', '\n', '\r', '"', "'", '\\', '/', '.', '%', '{', '}', '[', ']', ':', '@', '#', '?', '&', '=', 'a', '0', 'é', '😀', '￿'];
  while (out.length < count) {
    const base = ADVERSARIAL_STRINGS[Math.floor(rand() * ADVERSARIAL_STRINGS.length)].slice(0, maxLength);
    const chars = [...base];
    const edits = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < edits; i++) {
      const pos = Math.floor(rand() * (chars.length + 1));
      const op = rand();
      const ch = alphabet[Math.floor(rand() * alphabet.length)];
      if (op < 0.4) chars.splice(pos, 0, ch);
      else if (op < 0.7) chars.splice(pos, 1);
      else chars[pos] = ch;
    }
    out.push(chars.join('').slice(0, maxLength));
  }
  return out;
}
