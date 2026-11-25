/**
 * Prototype-pollution hardening for options handed to node:http, node:https,
 * node:tls and node:http2.
 *
 * Node merges request/connection options with Object.assign, so any option
 * key we leave *absent* can be read from a polluted Object.prototype
 * (e.g. `Object.prototype.rejectUnauthorized = false`, `socketPath`,
 * `createConnection`, `checkServerIdentity`). This is the root cause of a
 * family of axios advisories (2026-42033, -42264, -44494, -44495,
 * -101905 …). Every security-relevant key is therefore set as an *own*
 * property with a safe value, which shadows anything inherited.
 */
import tls from 'node:tls';

/** Safe own values for TLS-relevant keys. */
export function pinnedTls(extra = {}) {
  return {
    rejectUnauthorized: true,
    checkServerIdentity: tls.checkServerIdentity,
    secureContext: undefined,
    pfx: undefined,
    key: undefined,
    cert: undefined,
    passphrase: undefined,
    ciphers: undefined,
    secureProtocol: undefined,
    session: undefined,
    enableTrace: false,
    requestCert: undefined,
    pskCallback: undefined,
    ca: undefined,
    servername: undefined,
    minVersion: undefined,
    maxVersion: undefined,
    secureOptions: undefined,
    ecdhCurve: undefined,
    sigalgs: undefined,
    honorCipherOrder: undefined,
    ...extra,
  };
}

/** Safe own values for HTTP request/connection keys. */
export function pinnedHttp(extra = {}) {
  return {
    socketPath: undefined,
    createConnection: undefined,
    auth: undefined,
    localAddress: undefined,
    localPort: undefined,
    family: undefined,
    hints: undefined,
    setHost: true,
    insecureHTTPParser: false,
    joinDuplicateHeaders: undefined,
    maxHeaderSize: undefined,
    timeout: undefined,
    uniqueHeaders: undefined,
    signal: undefined,
    defaultPort: undefined,
    ...extra,
  };
}

export { own, ownGet } from './own.js';
