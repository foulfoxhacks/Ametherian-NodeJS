/**
 * Explicit runtime capability reporting. Packages check for what they need
 * and fail with UnsupportedCapabilityError instead of silently falling back.
 */
import { UnsupportedCapabilityError } from './errors.js';

/**
 * @typedef {object} RuntimeCapabilities
 * @property {'node' | 'deno' | 'bun' | 'unknown'} runtime
 * @property {string | null} version   Runtime version string, e.g. "22.11.0".
 * @property {boolean} fetch           Global fetch/Request/Response/Headers.
 * @property {boolean} webStreams      Global ReadableStream/TransformStream.
 * @property {boolean} abortSignalAny  AbortSignal.any().
 * @property {boolean} abortSignalTimeout AbortSignal.timeout().
 * @property {boolean} webCrypto       globalThis.crypto.subtle.
 * @property {boolean} structuredClone Global structuredClone.
 */

/**
 * Snapshot of what the current runtime offers. Pure detection; no side effects.
 * @param {typeof globalThis} [g] Global object to inspect (injectable for tests).
 * @returns {Readonly<RuntimeCapabilities>}
 */
export function getRuntimeCapabilities(g = globalThis) {
  let runtime = 'unknown';
  let version = null;
  if (typeof g.Deno?.version?.deno === 'string') {
    runtime = 'deno';
    version = g.Deno.version.deno;
  } else if (typeof g.Bun?.version === 'string') {
    runtime = 'bun';
    version = g.Bun.version;
  } else if (typeof g.process?.versions?.node === 'string') {
    runtime = 'node';
    version = g.process.versions.node;
  }
  return Object.freeze({
    runtime,
    version,
    fetch: ['fetch', 'Request', 'Response', 'Headers'].every((k) => typeof g[k] === 'function'),
    webStreams: typeof g.ReadableStream === 'function' && typeof g.TransformStream === 'function',
    abortSignalAny: typeof g.AbortSignal?.any === 'function',
    abortSignalTimeout: typeof g.AbortSignal?.timeout === 'function',
    webCrypto: typeof g.crypto?.subtle === 'object' && g.crypto.subtle !== null,
    structuredClone: typeof g.structuredClone === 'function',
  });
}

/**
 * Throw UnsupportedCapabilityError unless every named capability is present.
 * @param {...Exclude<keyof RuntimeCapabilities, 'runtime' | 'version'>} names
 */
export function requireCapability(...names) {
  const caps = getRuntimeCapabilities();
  for (const name of names) {
    if (!(name in caps) || name === 'runtime' || name === 'version') {
      throw new TypeError(`Unknown capability: ${String(name)}`);
    }
    if (caps[name] !== true) throw new UnsupportedCapabilityError(name);
  }
}
