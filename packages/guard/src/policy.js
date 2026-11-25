/**
 * Destination policy: decide whether an outbound request may go to a URL,
 * resolved address, or redirect target. See docs/threat-models/guard.md.
 */
import { AmetherianError, UnsupportedCapabilityError, validateOptions, redactUrl } from '@foulfoxhacks/ametherian-core';

/**
 * node:dns, loaded only when a connect-time lookup actually runs, so this
 * module also loads on runtimes without DNS access (Cloudflare Workers, browsers).
 */
function systemLookup(hostname, options, callback) {
  const dns = globalThis.process?.getBuiltinModule?.('node:dns');
  if (!dns) {
    queueMicrotask(() => callback(new UnsupportedCapabilityError('dns.lookup')));
    return;
  }
  dns.lookup(hostname, options, callback);
}
import { classifyAddress, unbracket, ADDRESS_CATEGORIES } from './ip.js';

export const DESTINATION_BLOCKED = 'AMETHERIAN_DESTINATION_BLOCKED';

/** Thrown when a destination violates the policy. Never retryable. */
export class DestinationBlockedError extends AmetherianError {
  /**
   * @param {string} message
   * @param {{ reason: string, url?: string, host?: string, address?: string, category?: string | null }} info
   */
  constructor(message, info) {
    super(message, { code: DESTINATION_BLOCKED, retryable: false, details: info });
  }
}

const DEFAULT_PORTS = { 'http:': 80, 'https:': 443 };

/** Hostnames classified before DNS (T10). Lower-case, no trailing dot. */
function nameCategory(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  if (host.endsWith('.internal') || host === 'internal') return 'private';
  if (host.endsWith('.local')) return 'private';
  return null;
}

function normaliseHost(host) {
  return unbracket(String(host)).toLowerCase().replace(/\.$/, '');
}

/** "example.com" exact; ".example.com" or "*.example.com" subdomains only. */
function compileHostPatterns(list) {
  return list.map((raw) => {
    const p = normaliseHost(raw);
    if (p.startsWith('*.')) return { suffix: p.slice(1) };
    if (p.startsWith('.')) return { suffix: p };
    return { exact: p };
  });
}

function matchesAny(host, patterns) {
  return patterns.some((p) => (p.exact ? host === p.exact : host.endsWith(p.suffix)));
}

const SCHEMA = {
  allowedProtocols: {
    type: 'array',
    min: 1,
    default: ['https:', 'http:'],
    validate: (v) => (v.every((p) => typeof p === 'string' && /^[a-z][a-z0-9+.-]*:$/.test(p)) ? undefined : 'entries must look like "https:"'),
  },
  allowCategories: {
    type: 'array',
    default: [],
    validate: (v) => {
      const bad = v.filter((c) => !ADDRESS_CATEGORIES.includes(c));
      return bad.length ? `unknown categories: ${bad.join(', ')}` : undefined;
    },
  },
  allowHosts: { type: 'array', default: [], validate: (v) => (v.every((h) => typeof h === 'string' && h) ? undefined : 'entries must be non-empty strings') },
  denyHosts: { type: 'array', default: [], validate: (v) => (v.every((h) => typeof h === 'string' && h) ? undefined : 'entries must be non-empty strings') },
  allowPorts: { type: 'array', validate: (v) => (v.every((p) => Number.isInteger(p) && p > 0 && p < 65536) ? undefined : 'entries must be ports 1-65535') },
  allowCredentials: { type: 'boolean', default: false },
  allowDowngrade: { type: 'boolean', default: false },
  lookup: { type: 'function' },
};

/**
 * @param {object} [options] See docs/threat-models/guard.md "Defaults".
 */
export function createDestinationPolicy(options) {
  const opts = validateOptions(options, SCHEMA, { name: 'destination policy options' });
  const protocols = new Set(opts.allowedProtocols);
  const allowedCategories = new Set(['public', ...opts.allowCategories]);
  const allowHosts = compileHostPatterns(opts.allowHosts);
  const denyHosts = compileHostPatterns(opts.denyHosts);
  const ports = opts.allowPorts ? new Set(opts.allowPorts) : null;
  const baseLookup = opts.lookup ?? systemLookup;

  function block(reason, message, extra) {
    return new DestinationBlockedError(message, { reason, ...extra });
  }

  /** Check a hostname (or IP literal) against host lists and categories. */
  function checkHost(rawHost, context = {}) {
    const host = normaliseHost(rawHost);
    if (matchesAny(host, denyHosts)) throw block('denied-host', `Host is denied: ${host}`, { ...context, host });
    if (allowHosts.length && !matchesAny(host, allowHosts)) {
      throw block('host-not-allowed', `Host is not in the allow list: ${host}`, { ...context, host });
    }
    const category = classifyAddress(host) ?? nameCategory(host);
    if (category !== null && !allowedCategories.has(category)) {
      throw block('blocked-address', `Destination ${host} is ${category}`, { ...context, host, category });
    }
    return host;
  }

  /**
   * Validate a URL. Returns the parsed URL on success.
   * @param {string | URL} input
   * @param {string | URL} [base]
   * @returns {URL}
   */
  function checkUrl(input, base) {
    let url;
    try {
      url = new URL(String(input), base === undefined ? undefined : String(base));
    } catch {
      throw block('invalid-url', 'URL could not be parsed', { url: redactUrl(String(input)) });
    }
    const safe = redactUrl(url);
    if (!protocols.has(url.protocol)) {
      throw block('protocol', `Protocol not allowed: ${url.protocol}`, { url: safe });
    }
    if ((url.username || url.password) && !opts.allowCredentials) {
      throw block('credentials', 'URLs with embedded credentials are not allowed', { url: safe });
    }
    const port = url.port ? Number(url.port) : DEFAULT_PORTS[url.protocol];
    if (ports && !ports.has(port)) {
      throw block('port', `Port not allowed: ${port}`, { url: safe });
    }
    checkHost(url.hostname, { url: safe });
    return url;
  }

  /**
   * Validate a redirect hop. `location` is resolved against `from`.
   * @param {string | URL} from
   * @param {string} location
   * @returns {URL}
   */
  function checkRedirect(from, location) {
    const prev = new URL(String(from));
    const next = checkUrl(location, prev);
    if (prev.protocol === 'https:' && next.protocol === 'http:' && !opts.allowDowngrade) {
      throw block('protocol-downgrade', 'Redirect from https to http is not allowed', { url: redactUrl(next) });
    }
    return next;
  }

  /**
   * Validate one resolved IP address.
   * @param {string} address
   * @param {string} [hostname]
   */
  function checkAddress(address, hostname) {
    const category = classifyAddress(address);
    if (category === null) {
      throw block('invalid-address', 'Resolved value is not an IP address', { host: hostname });
    }
    if (!allowedCategories.has(category)) {
      throw block('blocked-address', `${hostname ?? address} resolved to ${category} address`, {
        host: hostname,
        address,
        category,
      });
    }
  }

  /**
   * dns.lookup-compatible function that rejects blocked answers at connect
   * time (T4, T5). Pass to http.Agent / https.Agent `lookup`, net.connect, or
   * undici `connect.lookup`. Fails if ANY resolved address is blocked.
   */
  function lookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'number') {
      options = { family: options };
    }
    const wantAll = options?.all === true;
    try {
      checkHost(hostname);
    } catch (err) {
      queueMicrotask(() => callback(err));
      return;
    }
    baseLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: classifyFamily(addresses) }];
      try {
        for (const entry of list) checkAddress(entry.address, hostname);
      } catch (blocked) {
        return callback(blocked);
      }
      if (wantAll) return callback(null, list);
      if (list.length === 0) {
        const e = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND', hostname });
        return callback(e);
      }
      return callback(null, list[0].address, list[0].family);
    });
  }

  return Object.freeze({ checkUrl, checkRedirect, checkAddress, checkHost, lookup, options: opts });
}

function classifyFamily(address) {
  return String(address).includes(':') ? 6 : 4;
}
