/**
 * Redaction helpers so credentials do not end up in logs or error details.
 * Matching is case-insensitive. Outputs are new values; inputs are not mutated.
 */

export const REDACTED = '[REDACTED]';

export const DEFAULT_SENSITIVE_HEADERS = Object.freeze([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
]);

export const DEFAULT_SENSITIVE_QUERY_PARAMS = Object.freeze([
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'signature',
  'sig',
  'x-amz-signature',
  'x-amz-credential',
  'x-amz-security-token',
  'code',
]);

function toSet(defaults, extra) {
  return new Set([...defaults, ...(extra ?? [])].map((s) => s.toLowerCase()));
}

/**
 * Return a plain-object copy of headers with sensitive values replaced.
 * Accepts a Headers instance, an array of [name, value] pairs, or a plain object.
 *
 * @param {Headers | Array<[string, string]> | Record<string, string | string[] | undefined>} headers
 * @param {{ extra?: string[], replacement?: string }} [options]
 * @returns {Record<string, string | string[] | undefined>}
 */
export function redactHeaders(headers, options = {}) {
  const sensitive = toSet(DEFAULT_SENSITIVE_HEADERS, options.extra);
  const replacement = options.replacement ?? REDACTED;
  const entries =
    headers instanceof Headers || Array.isArray(headers) ? [...headers] : Object.entries(headers ?? {});
  const out = Object.create(null);
  for (const [name, value] of entries) {
    out[name] = sensitive.has(String(name).toLowerCase()) && value !== undefined ? replacement : value;
  }
  return out;
}

/**
 * Return a URL string with userinfo removed and sensitive query values replaced.
 * Unparseable input is never echoed back.
 *
 * @param {string | URL} url
 * @param {{ extra?: string[], replacement?: string }} [options]
 * @returns {string}
 */
export function redactUrl(url, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return '[unparseable URL]';
  }
  const replacement = options.replacement ?? REDACTED;
  const sensitive = toSet(DEFAULT_SENSITIVE_QUERY_PARAMS, options.extra);
  if (parsed.username || parsed.password) {
    parsed.username = '';
    parsed.password = '';
  }
  const params = new URLSearchParams();
  let changed = false;
  for (const [k, v] of parsed.searchParams) {
    if (sensitive.has(k.toLowerCase())) {
      params.append(k, replacement);
      changed = true;
    } else {
      params.append(k, v);
    }
  }
  if (changed) parsed.search = params.toString();
  return parsed.toString();
}
