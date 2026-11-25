/**
 * Node.js entry point: node:http / node:https transport by default, opt-in
 * HTTP/2, proxy support, custom CA. Edge runtimes get ./edge.js instead
 * through package.json export conditions.
 */
import { buildHttpClient, HttpResponse, HttpStreamResponse } from './client.js';
import { createNodeTransport } from './transport.js';
import { createHttp2Transport } from './http2.js';
import { createFetchTransport } from './fetch-transport.js';
import { makeCreateFetch } from './fetch.js';

function nodeTransport({ policy, ca, proxy, http2, maxSocketsPerOrigin, maxTotalSockets }) {
  return http2
    ? createHttp2Transport({ lookup: policy.lookup, ca })
    : createNodeTransport({ lookup: policy.lookup, ca, proxy, maxSocketsPerOrigin, maxTotalSockets });
}

/** @param {object} [options] */
export function createHttpClient(options) {
  return buildHttpClient(options, nodeTransport);
}

export const createFetch = makeCreateFetch(createHttpClient);
export { HttpResponse, HttpStreamResponse, createNodeTransport, createHttp2Transport, createFetchTransport };
export * from './errors.js';
