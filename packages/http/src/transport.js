/**
 * HTTP/1.1 transport over node:http / node:https, with optional HTTP proxy.
 *
 * Transport contract (shared with the HTTP/2 transport and test mocks):
 *
 *   transport({ method, url, headers, body, signal, maxResponseBytes, stream })
 *     -> Promise<{ status, statusText, headers: Array<[string, string]>,
 *                  body: Uint8Array | ReadableStream<Uint8Array> }>
 *   The request `body` is a Uint8Array or a single-use ReadableStream<Uint8Array>.
 *
 * Proxy mode (see docs/threat-models/http.md H1, H13):
 *  - http:// targets are sent to the proxy in absolute form;
 *  - https:// targets are tunnelled with CONNECT, then TLS is negotiated
 *    end-to-end with the target (the proxy never sees plaintext);
 *  - the proxy resolves target names, so the guard's connect-time lookup
 *    cannot run for proxied requests (URL checks still do);
 *  - proxy credentials go only to the proxy, as Proxy-Authorization.
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import { toAbortError, redactUrl, ConfigError } from '@foulfoxhacks/ametherian-core';
import { NetworkError } from './errors.js';
import { bodyFrom, responseHeaderPairs, ametherianCause, writeStreamBody } from './body.js';
import { pinnedHttp, pinnedTls, ownGet } from './hardening.js';

function parseProxy(proxy) {
  if (proxy === undefined) return null;
  let u;
  try {
    u = new URL(String(proxy));
  } catch {
    throw new ConfigError('Invalid proxy URL', { problems: ['proxy: not a valid URL'] });
  }
  if (u.protocol !== 'http:') {
    throw new ConfigError('Only http:// proxies are supported', { problems: [`proxy: unsupported protocol ${u.protocol}`] });
  }
  const auth =
    u.username || u.password
      ? `Basic ${Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64')}`
      : null;
  return { hostname: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port || 80), auth, display: redactUrl(u) };
}

/**
 * @param {{ keepAlive?: boolean, lookup?: Function, ca?: string | Buffer | Array<string | Buffer>, proxy?: string,
 *           maxSocketsPerOrigin?: number, maxTotalSockets?: number, maxFreeSockets?: number }} [options]
 */
export function createNodeTransport(options = {}) {
  // Read only own properties: inherited (polluted) values must never configure the transport.
  const opt = (k) => ownGet(options, k);
  const proxy = parseProxy(opt('proxy'));
  const lookup = opt('lookup');
  const tlsOptions = pinnedTls(opt('ca') ? { ca: opt('ca') } : {});
  // Pool limits, like undici's Pool connections/maxTotal: bounded sockets per origin and overall.
  const pool = {
    keepAlive: opt('keepAlive') ?? true,
    maxSockets: opt('maxSocketsPerOrigin') ?? 50,
    maxTotalSockets: opt('maxTotalSockets') ?? 256,
    maxFreeSockets: opt('maxFreeSockets') ?? 16,
    scheduling: 'lifo',
  };
  const agentOptions = { ...pinnedHttp(), ...pool, lookup, ...tlsOptions };
  const agents = { 'http:': new http.Agent(agentOptions), 'https:': new https.Agent(agentOptions) };
  // Reaching the proxy itself uses normal DNS: the proxy is trusted configuration and often private.
  const proxyAgent = proxy ? new http.Agent({ ...pinnedHttp(), ...pool, lookup: undefined }) : null;

  function tunnel(url, onSocket) {
    const target = `${url.hostname.replace(/^\[|\]$/g, '')}:${url.port || 443}`;
    const connectReq = http.request({
      ...pinnedHttp(),
      lookup: undefined,
      host: proxy.hostname,
      port: proxy.port,
      method: 'CONNECT',
      path: target,
      agent: false,
      headers: { host: target, ...(proxy.auth ? { 'proxy-authorization': proxy.auth } : {}) },
    });
    connectReq.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        onSocket(new NetworkError(`Proxy ${proxy.display} refused CONNECT (${res.statusCode})`, undefined, { proxyStatus: res.statusCode }));
        return;
      }
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const secure = tls.connect({ ...tlsOptions, socket, host, port: undefined, servername: isIP(host) ? undefined : host, ALPNProtocols: ['http/1.1'] });
      secure.once('secureConnect', () => onSocket(null, secure));
      secure.once('error', (e) => onSocket(e));
    });
    connectReq.once('error', (e) => onSocket(new NetworkError(`Proxy ${proxy.display} unreachable: ${e.code ?? e.message}`, e)));
    connectReq.end();
  }

  function transport({ method, url, headers, body, signal, maxResponseBytes, stream = false, decompress = true }) {
    return new Promise((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http;
      if (!agents[url.protocol]) return reject(new TypeError(`Unsupported protocol ${url.protocol}`));
      let settled = false;
      let current = null; // { destroy } for the response body once headers arrive
      const fail = (err) => {
        if (settled) return;
        settled = true;
        req.destroy();
        reject(err);
      };

      let requestOptions;
      if (proxy && url.protocol === 'http:') {
        requestOptions = {
          ...pinnedHttp(),
          lookup: undefined,
          host: proxy.hostname,
          port: proxy.port,
          path: url.href,
          method,
          agent: proxyAgent,
          headers: { host: url.host, ...headers, ...(proxy.auth ? { 'proxy-authorization': proxy.auth } : {}) },
        };
      } else if (proxy) {
        requestOptions = {
          ...pinnedHttp(),
          ...tlsOptions,
          method,
          headers,
          // agent must be left unset: `agent: false` makes Node build its own https.Agent,
          // which ignores createConnection and would connect directly, bypassing the proxy.
          agent: undefined,
          createConnection: (_opts, oncreate) => {
            tunnel(url, oncreate);
            return undefined;
          },
        };
      } else {
        requestOptions = {
          ...pinnedHttp(),
          ...tlsOptions,
          // Keep URL userinfo (only present when the policy allows credentials) instead of the pinned undefined.
          auth: url.username || url.password ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : undefined,
          method,
          headers,
          agent: agents[url.protocol],
          lookup,
        };
      }

      // Never hand Node a URL object: its URL detection reads `auth`/`path`, which a polluted
      // prototype can fake, turning our options into the callback. Use explicit own fields.
      if (!(proxy && url.protocol === 'http:')) {
        Object.assign(requestOptions, {
          protocol: url.protocol,
          hostname: url.hostname.replace(/^\[|\]$/g, ''),
          host: undefined,
          port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
          path: `${url.pathname}${url.search}`,
        });
      }
      const req = (proxy && url.protocol === 'http:' ? http : mod).request(requestOptions);

      req.on('response', (res) => {
        const pairs = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) pairs.push([res.rawHeaders[i], res.rawHeaders[i + 1]]);
        const { decoded, body: resBody, destroy } = bodyFrom(res, res.headers['content-encoding'], { maxResponseBytes, stream, decompress });
        current = { destroy };
        const head = { status: res.statusCode, statusText: res.statusMessage ?? '', headers: responseHeaderPairs(pairs, decoded) };
        if (stream) {
          settled = true;
          resolve({ ...head, body: resBody });
          return;
        }
        resBody.then(
          (bytes) => {
            if (settled) return;
            settled = true;
            resolve({ ...head, body: bytes });
          },
          fail,
        );
      });

      req.on('error', (e) => {
        const typed = ametherianCause(e);
        if (typed) return fail(typed); // e.g. guard block raised from lookup, or proxy error
        if (signal?.aborted) return fail(toAbortError(signal.reason));
        fail(new NetworkError(`Request to ${url.host} failed: ${e.code ?? e.message}`, e, { host: url.host }));
      });

      if (signal) {
        const onAbort = () => {
          const err = toAbortError(signal.reason);
          current?.destroy(err); // errors an in-flight streamed body with the abort reason
          fail(err);
          req.destroy();
        };
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => {
          if (!stream) signal.removeEventListener('abort', onAbort);
        });
      }

      if (body instanceof Uint8Array) {
        if (body.byteLength) req.end(body);
        else req.end();
      } else if (body) {
        writeStreamBody(req, body);
      } else {
        req.end();
      }
    });
  }

  transport.close = () => {
    agents['http:'].destroy();
    agents['https:'].destroy();
    proxyAgent?.destroy();
  };
  transport.proxied = Boolean(proxy);
  return transport;
}
