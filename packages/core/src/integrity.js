/**
 * Runtime integrity checks for the residual risks that a library cannot
 * shadow by itself (see docs/vulnerability-model.md):
 *
 *  - Prototype pollution. Node's own internals read options such as
 *    `signal` from plain object literals, so a polluted Object.prototype can
 *    affect every stream in the process. `detectPrototypePollution` finds
 *    non-standard properties on Object.prototype; Ametherian's HTTP client
 *    calls `assertNoPrototypePollution` before every request and fails
 *    closed. `lockdownPrototypes` is an opt-in hardening step for apps.
 *  - Outdated runtimes. `checkNodeVersion` compares the running Node.js
 *    version with the minimum security-patched release per major line.
 */
import { AmetherianError } from './errors.js';

export const PROTOTYPE_POLLUTED = 'AMETHERIAN_PROTOTYPE_POLLUTED';
export const RUNTIME_OUTDATED = 'AMETHERIAN_RUNTIME_OUTDATED';

/**
 * Minimum Node.js release per supported major line: the latest *security*
 * release in that line. Kept current by tools/advisory-watch (it fails when
 * nodejs.org publishes a newer security release or a line reaches end of life).
 */
export const NODE_SECURITY_MINIMUMS = Object.freeze({ 22: '22.23.5', 24: '24.22.3', 26: '26.13.1' });

/** Own properties Object.prototype has in every current JavaScript engine. */
const STANDARD_OBJECT_PROTOTYPE = new Set([
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  'hasOwnProperty',
  '__lookupGetter__',
  '__lookupSetter__',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'valueOf',
  '__proto__',
  'toLocaleString',
]);

/**
 * Names of non-standard own properties on Object.prototype (string and
 * symbol keys). An empty array means no pollution was found.
 * @returns {string[]}
 */
export function detectPrototypePollution() {
  const found = [];
  for (const key of Reflect.ownKeys(Object.prototype)) {
    if (typeof key === 'symbol') found.push(key.toString());
    else if (!STANDARD_OBJECT_PROTOTYPE.has(key)) found.push(key);
  }
  return found;
}

/**
 * Throw (fail closed) if Object.prototype carries non-standard properties.
 * The error lists the property names, never their values.
 */
export function assertNoPrototypePollution() {
  const keys = detectPrototypePollution();
  if (keys.length) {
    throw new AmetherianError(`Object.prototype is polluted (${keys.length} non-standard propert${keys.length === 1 ? 'y' : 'ies'}); refusing to continue`, {
      code: PROTOTYPE_POLLUTED,
      retryable: false,
      details: { keys: Object.freeze(keys.slice(0, 50)) },
    });
  }
}

/**
 * Opt-in: freeze Object.prototype, Function.prototype and Array.prototype so
 * they cannot be polluted later. Call once at application start-up, after
 * polyfills load. Throws if pollution is already present. Irreversible.
 * @returns {{ frozen: string[] }}
 */
export function lockdownPrototypes() {
  assertNoPrototypePollution();
  const targets = { 'Object.prototype': Object.prototype, 'Function.prototype': Function.prototype, 'Array.prototype': Array.prototype };
  for (const value of Object.values(targets)) Object.freeze(value);
  return { frozen: Object.keys(targets) };
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

/**
 * Compare a Node.js version with the minimum patched release of its major line.
 * @param {Record<string, string>} minimums e.g. { "20": "20.19.6", "22": "22.21.1" }
 * @param {string} [version] defaults to process.version
 * @returns {{ ok: boolean, current: string, major: number, required: string | null, reason?: string }}
 */
export function checkNodeVersion(minimums = NODE_SECURITY_MINIMUMS, version = globalThis.process?.version) {
  const cur = parseVersion(version);
  if (!cur) return { ok: false, current: String(version), major: NaN, required: null, reason: 'unparseable-version' };
  const required = minimums[String(cur[0])];
  if (!required) return { ok: false, current: String(version), major: cur[0], required: null, reason: 'unsupported-major' };
  const req = parseVersion(required);
  return compare(cur, req) >= 0
    ? { ok: true, current: String(version), major: cur[0], required }
    : { ok: false, current: String(version), major: cur[0], required, reason: 'below-security-minimum' };
}

/** Throwing form of checkNodeVersion. */
export function assertNodeVersion(minimums = NODE_SECURITY_MINIMUMS, version) {
  const r = checkNodeVersion(minimums, version);
  if (!r.ok) {
    throw new AmetherianError(`Node.js ${r.current} does not meet the security minimum${r.required ? ` ${r.required}` : ''} (${r.reason})`, {
      code: RUNTIME_OUTDATED,
      retryable: false,
      details: { ...r },
    });
  }
  return r;
}
