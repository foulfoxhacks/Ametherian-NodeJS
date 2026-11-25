/**
 * Edge entry point (Cloudflare Workers, Deno, other fetch() runtimes).
 * Selected automatically through the "workerd", "worker" and "browser"
 * export conditions, or explicitly via "@foulfoxhacks/ametherian-http/edge".
 *
 * Same API as the Node entry, with a fetch()-based transport. The Node-only
 * options proxy, http2 and ca are refused here rather than silently ignored.
 */
import { ConfigError } from '@foulfoxhacks/ametherian-core';
import { buildHttpClient, HttpResponse, HttpStreamResponse } from './client.js';
import { createFetchTransport } from './fetch-transport.js';
import { makeCreateFetch } from './fetch.js';

function edgeTransport({ ca, proxy, http2 }) {
  const unsupported = [ca && 'ca', proxy && 'proxy', http2 && 'http2'].filter(Boolean);
  if (unsupported.length) {
    throw new ConfigError(`Not supported by the edge transport: ${unsupported.join(', ')}`, {
      problems: unsupported.map((k) => `${k}: the platform fetch() decides this on edge runtimes`),
    });
  }
  return createFetchTransport();
}

/** @param {object} [options] */
export function createHttpClient(options) {
  return buildHttpClient(options, edgeTransport);
}

export const createFetch = makeCreateFetch(createHttpClient);
export { HttpResponse, HttpStreamResponse, createFetchTransport };
export * from './errors.js';
