/**
 * Node.js transport over node:http / node:https.
 *
 * The transport contract is deliberately small so tests and other runtimes
 * can supply their own (see ametherian-testing):
 *
 *   transport({ method, url, headers, body, signal, lookup, maxResponseBytes })
 *     -> Promise<{ status, statusText, headers: Array<[string, string]>, body: Uint8Array }>
 *
 * Bodies are size-limited after decompression, so a small compressed
 * payload cannot expand into unbounded memory (decompression bombs).
 */
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { LimitExceededError, toAbortError } from '@foulfoxhacks/ametherian-core';
import { NetworkError } from './errors.js';

function decoderFor(encoding) {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    case '':
    case 'identity':
      return null;
    default:
      return undefined; // unsupported: hand back raw bytes
  }
}

/**
 * @param {{ keepAlive?: boolean, lookup?: Function }} [options]
 */
export function createNodeTransport(options = {}) {
  const agentOptions = { keepAlive: options.keepAlive ?? true, ...(options.lookup ? { lookup: options.lookup } : {}) };
  const agents = { 'http:': new http.Agent(agentOptions), 'https:': new https.Agent(agentOptions) };

  function transport({ method, url, headers, body, signal, maxResponseBytes, decompress = true }) {
    return new Promise((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http;
      const agent = agents[url.protocol];
      if (!agent) return reject(new TypeError(`Unsupported protocol ${url.protocol}`));
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        req.destroy();
        reject(err);
      };

      const req = mod.request(url, { method, headers, agent, ...(options.lookup ? { lookup: options.lookup } : {}) }, (res) => {
        const decoder = decompress ? decoderFor(res.headers['content-encoding']) : null;
        const stream = decoder ? res.pipe(decoder) : res;
        if (decoder) decoder.on('error', (e) => fail(new NetworkError('Response decompression failed', e)));
        const chunks = [];
        let total = 0;
        stream.on('data', (chunk) => {
          total += chunk.length;
          if (total > maxResponseBytes) {
            res.destroy();
            decoder?.destroy();
            fail(new LimitExceededError(`Response body exceeded ${maxResponseBytes} bytes`, {
              limit: maxResponseBytes,
              actual: total,
              resource: 'response-body',
            }));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          if (settled) return;
          settled = true;
          const headerPairs = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) headerPairs.push([res.rawHeaders[i], res.rawHeaders[i + 1]]);
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage ?? '',
            headers: headerPairs.filter(([k]) => !(decoder && /^content-(encoding|length)$/i.test(k))),
            body: new Uint8Array(Buffer.concat(chunks)),
          });
        });
        res.on('error', (e) => fail(new NetworkError('Response stream failed', e)));
      });

      req.on('error', (e) => {
        if (e && typeof e.code === 'string' && e.code.startsWith('AMETHERIAN_')) return fail(e); // e.g. guard block from lookup
        if (signal?.aborted) return fail(toAbortError(signal.reason));
        fail(new NetworkError(`Request to ${url.host} failed: ${e.code ?? e.message}`, e, { host: url.host }));
      });

      if (signal) {
        if (signal.aborted) return fail(toAbortError(signal.reason));
        const onAbort = () => fail(toAbortError(signal.reason));
        signal.addEventListener('abort', onAbort, { once: true });
        req.on('close', () => signal.removeEventListener('abort', onAbort));
      }

      if (body && body.byteLength) req.end(body);
      else req.end();
    });
  }

  transport.close = () => {
    agents['http:'].destroy();
    agents['https:'].destroy();
  };
  return transport;
}
