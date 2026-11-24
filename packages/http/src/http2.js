/**
 * Opt-in HTTP/2 transport over node:http2. One session per origin, reused
 * until idle or errored. Supports https:// (TLS + ALPN h2) and, for local
 * use and tests, http:// with prior knowledge (h2c).
 *
 * Same contract as createNodeTransport. The guard's `lookup` is passed to
 * the connection, so DNS-time destination checks still apply.
 */
import http2 from 'node:http2';
import { isIP } from 'node:net';
import { toAbortError } from '@foulfoxhacks/ametherian-core';
import { NetworkError } from './errors.js';
import { bodyFrom, responseHeaderPairs, ametherianCause } from './body.js';
import { pinnedTls, ownGet } from './hardening.js';

// Connection-specific headers are forbidden in HTTP/2 (RFC 9113 §8.2.2).
const FORBIDDEN = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'host']);

/**
 * @param {{ lookup?: Function, ca?: string | Buffer | Array<string | Buffer>, idleTimeoutMs?: number }} [options]
 */
export function createHttp2Transport(options = {}) {
  const opt = (k) => ownGet(options, k);
  /** @type {Map<string, import('node:http2').ClientHttp2Session>} */
  const sessions = new Map();
  const idleTimeoutMs = opt('idleTimeoutMs') ?? 30_000;

  function sessionFor(url) {
    const existing = sessions.get(url.origin);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const session = http2.connect(url.origin, {
      ...pinnedTls(opt('ca') ? { ca: opt('ca') } : {}),
      // Own values shadow polluted prototypes (axios CVE-2026-101898/-101905 class).
      createConnection: undefined,
      socketPath: undefined,
      localAddress: undefined,
      signal: undefined,
      settings: undefined,
      lookup: opt('lookup'),
      servername: url.protocol === 'https:' && !isIP(host) ? host : undefined,
    });
    session.setTimeout(idleTimeoutMs, () => session.close());
    session.on('error', () => {}); // surfaced per request via stream errors
    session.on('close', () => {
      if (sessions.get(url.origin) === session) sessions.delete(url.origin);
    });
    session.unref?.();
    sessions.set(url.origin, session);
    return session;
  }

  function transport({ method, url, headers, body, signal, maxResponseBytes, stream = false, decompress = true }) {
    return new Promise((resolve, reject) => {
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return reject(new TypeError(`Unsupported protocol ${url.protocol}`));
      let settled = false;
      let current = null;
      let req;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        req?.close(http2.constants.NGHTTP2_CANCEL);
        reject(err);
      };
      const wrap = (e) =>
        ametherianCause(e) ?? (signal?.aborted ? toAbortError(signal.reason) : new NetworkError(`HTTP/2 request to ${url.host} failed: ${e?.code ?? e?.message}`, e, { host: url.host }));

      let session;
      try {
        session = sessionFor(url);
      } catch (e) {
        return fail(wrap(e));
      }
      const onSessionError = (e) => fail(wrap(e));
      session.once('error', onSessionError);

      const h2headers = { ':method': method, ':path': `${url.pathname}${url.search}`, ':scheme': url.protocol.slice(0, -1) };
      for (const [k, v] of Object.entries(headers)) {
        if (!FORBIDDEN.has(k.toLowerCase())) h2headers[k.toLowerCase()] = v;
      }
      try {
        req = session.request(h2headers, { endStream: !(body && body.byteLength), signal: undefined, waitForTrailers: false });
      } catch (e) {
        return fail(wrap(e));
      }

      req.on('response', (h) => {
        session.removeListener('error', onSessionError);
        const status = Number(h[':status']);
        const pairs = [];
        for (const [k, v] of Object.entries(h)) {
          if (k.startsWith(':')) continue;
          for (const one of Array.isArray(v) ? v : [v]) pairs.push([k, String(one)]);
        }
        const { decoded, body: resBody, destroy } = bodyFrom(req, h['content-encoding'], { maxResponseBytes, stream, decompress });
        current = { destroy };
        const head = { status, statusText: '', headers: responseHeaderPairs(pairs, decoded) };
        if (stream) {
          settled = true;
          resolve({ ...head, body: resBody });
          return;
        }
        resBody.then((bytes) => {
          if (settled) return;
          settled = true;
          resolve({ ...head, body: bytes });
        }, fail);
      });
      req.on('error', (e) => fail(wrap(e)));

      if (signal) {
        const onAbort = () => {
          const err = toAbortError(signal.reason);
          current?.destroy(err);
          fail(err);
        };
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (body && body.byteLength) req.end(body);
    });
  }

  transport.close = () => {
    for (const s of sessions.values()) s.close();
    sessions.clear();
  };
  transport.protocol = 'h2';
  return transport;
}
