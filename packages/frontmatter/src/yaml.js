/**
 * A strict, bounded YAML subset for frontmatter.
 *
 * Supported: block mappings (nested by indentation), block sequences
 * (scalars or mappings), flow sequences/mappings of scalars ([a, b], {k: v}),
 * plain / 'single' / "double" quoted scalars, literal (|) and folded (>)
 * block scalars with -/+ chomping, comments, booleans, null, integers,
 * floats and ISO dates (kept as strings unless asked).
 *
 * Refused with a typed error: anchors (&), aliases (*), tags (!), merge keys
 * (<<), directives (%), multiple documents, tabs for indentation, duplicate
 * keys, and the keys __proto__, constructor and prototype. These are where
 * YAML parsers have historically had code-execution, billion-laughs and
 * prototype-pollution bugs.
 */
import { AmetherianError, LimitExceededError } from '@foulfoxhacks/ametherian-core';

export const YAML_INVALID = 'AMETHERIAN_YAML_INVALID';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class YamlError extends AmetherianError {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message, { code: YAML_INVALID, retryable: false, details: { line: line ?? null } });
  }
}

const INT = /^[-+]?(0|[1-9]\d*)$/;
const FLOAT = /^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[-+]\d{2}:?\d{2})?)?$/;

function scalar(raw, line, opts) {
  const s = raw.trim();
  if (s === '') return null;
  const c = s[0];
  if (c === '&' || c === '*') throw new YamlError('Anchors and aliases are not supported', line);
  if (c === '!') throw new YamlError('Tags are not supported', line);
  if (c === '"') return doubleQuoted(s, line);
  if (c === "'") {
    if (!s.endsWith("'") || s.length < 2) throw new YamlError('Unterminated single-quoted string', line);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (c === '[' || c === '{') return flow(s, line, opts);
  if (c === '|' || c === '>') throw new YamlError('Block scalar indicator in an unexpected place', line);
  if (/^(null|Null|NULL|~)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (INT.test(s)) {
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : s;
  }
  if (FLOAT.test(s)) return Number(s);
  if (DATE.test(s)) {
    if (opts.dates === 'date') {
      const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
      if (Number.isNaN(d.getTime())) throw new YamlError(`Invalid date ${s}`, line);
      return d;
    }
    return s;
  }
  return s;
}

function doubleQuoted(s, line) {
  if (!s.endsWith('"') || s.length < 2) throw new YamlError('Unterminated double-quoted string', line);
  try {
    // JSON string escapes are a strict subset of YAML's; YAML-only escapes are rejected.
    return JSON.parse(s.replace(/\\\//g, '/'));
  } catch {
    throw new YamlError('Unsupported escape in double-quoted string', line);
  }
}

/** Split a flow collection body on top-level commas, honouring quotes. */
function splitFlow(body, line) {
  const parts = [];
  let cur = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      cur += ch;
      if (ch === '\\' && quote === '"') {
        cur += body[++i] ?? '';
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') throw new YamlError('Nested flow collections are not supported', line);
    else if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (quote) throw new YamlError('Unterminated string in flow collection', line);
  if (cur.trim() !== '' || parts.length) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p, i, a) => !(p === '' && i === a.length - 1));
}

function flow(s, line, opts) {
  const open = s[0];
  const close = open === '[' ? ']' : '}';
  if (!s.endsWith(close)) throw new YamlError('Unterminated flow collection', line);
  const items = splitFlow(s.slice(1, -1), line);
  if (open === '[') return items.map((p) => scalar(p, line, opts));
  const map = Object.create(null);
  for (const p of items) {
    const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+?)\s*:\s*(.*)$/.exec(p);
    if (!m) throw new YamlError('Invalid flow mapping entry', line);
    setKey(map, String(scalar(m[1], line, opts)), scalar(m[2], line, opts), line);
  }
  return map;
}

function setKey(map, key, value, line) {
  if (FORBIDDEN_KEYS.has(key)) throw new YamlError(`Key "${key}" is not allowed`, line);
  if (key === '<<') throw new YamlError('Merge keys are not supported', line);
  if (Object.hasOwn(map, key)) throw new YamlError(`Duplicate key "${key}"`, line);
  map[key] = value;
}

/** Remove a trailing comment that is preceded by whitespace and outside quotes. */
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  return text.trimEnd();
}

function splitKey(text) {
  // key: value, with quoted keys allowed; ":" must be followed by space or end.
  const m = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#][^:#]*?)\s*:(?:\s+(.*)|$)/.exec(text);
  if (!m) return null;
  return { key: m[1], rest: m[2] ?? '' };
}

/**
 * Parse a YAML-subset document into a null-prototype object.
 * @param {string} source
 * @param {{ maxBytes?: number, maxDepth?: number, maxKeys?: number, dates?: 'string' | 'date' }} [options]
 */
export function parseYaml(source, options = {}) {
  const opts = { maxBytes: 256 * 1024, maxDepth: 16, maxKeys: 10_000, dates: 'string', ...options };
  const text = String(source);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > opts.maxBytes) {
    throw new LimitExceededError(`YAML exceeds ${opts.maxBytes} bytes`, { limit: opts.maxBytes, actual: bytes, resource: 'yaml' });
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((raw, i) => ({ raw, no: i + 1 }));
  let keys = 0;
  let pos = 0;

  const isBlank = (l) => /^\s*(#.*)?$/.test(l.raw);
  const indentOf = (l) => {
    const m = /^( *)(\t?)/.exec(l.raw);
    if (m[2]) throw new YamlError('Tabs are not allowed for indentation', l.no);
    return m[1].length;
  };
  const skipBlank = () => {
    while (pos < lines.length && isBlank(lines[pos])) pos++;
  };
  const countKey = (line) => {
    if (++keys > opts.maxKeys) throw new LimitExceededError(`YAML exceeds ${opts.maxKeys} keys`, { limit: opts.maxKeys, actual: keys, resource: 'yaml-keys' });
    void line;
  };

  for (const l of lines) {
    const t = l.raw.trim();
    if (/^(---|\.\.\.)(\s|$)/.test(t) && l.raw.startsWith(t.slice(0, 3))) throw new YamlError('Multiple documents are not supported', l.no);
    if (/^%/.test(l.raw)) throw new YamlError('Directives are not supported', l.no);
  }

  function blockScalar(header, parentIndent, line) {
    const m = /^([|>])([-+]?)\s*$/.exec(header);
    if (!m) throw new YamlError('Unsupported block scalar header', line);
    const [, style, chomp] = m;
    const collected = [];
    let indent = null;
    while (pos < lines.length) {
      const l = lines[pos];
      if (/^\s*$/.test(l.raw)) {
        collected.push('');
        pos++;
        continue;
      }
      const ind = indentOf(l);
      if (ind <= parentIndent) break;
      if (indent === null) indent = ind;
      if (ind < indent) break;
      collected.push(l.raw.slice(indent));
      pos++;
    }
    while (collected.length && collected[collected.length - 1] === '' && chomp !== '+') collected.pop();
    let out;
    if (style === '|') out = collected.join('\n');
    else {
      out = '';
      for (let i = 0; i < collected.length; i++) {
        const cur = collected[i];
        if (i === 0) out = cur;
        else if (cur === '' || collected[i - 1] === '' || /^\s/.test(cur)) out += `\n${cur}`;
        else out += ` ${cur}`;
      }
      out = out.replace(/\n(?=\n)/g, '');
    }
    return chomp === '-' ? out : `${out}\n`;
  }

  function value(rest, parentIndent, line, depth) {
    const r = stripComment(rest);
    if (r === '') {
      // Nested block or null.
      skipBlank();
      if (pos >= lines.length) return null;
      const next = lines[pos];
      const ind = indentOf(next);
      const t = next.raw.trim();
      if (ind > parentIndent || (ind === parentIndent && t.startsWith('- '))) {
        return node(ind, depth + 1);
      }
      return null;
    }
    if (/^[|>]/.test(r)) return blockScalar(r, parentIndent, line);
    return scalar(r, line, opts);
  }

  function node(indent, depth) {
    if (depth > opts.maxDepth) {
      throw new LimitExceededError(`YAML nesting exceeds ${opts.maxDepth}`, { limit: opts.maxDepth, actual: depth, resource: 'yaml-depth' });
    }
    skipBlank();
    const first = lines[pos];
    const t = first.raw.trim();
    if (t === '-' || t.startsWith('- ')) return sequence(indent, depth);
    return mapping(indent, depth);
  }

  function sequence(indent, depth) {
    const out = [];
    while (true) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos];
      const ind = indentOf(l);
      const t = l.raw.trim();
      if (ind !== indent || !(t === '-' || t.startsWith('- '))) {
        if (ind > indent) throw new YamlError('Unexpected indentation in sequence', l.no);
        break;
      }
      pos++;
      const rest = t === '-' ? '' : t.slice(2);
      const kv = splitKey(stripComment(rest));
      if (kv && !/^["'[{]/.test(rest.trim())) {
        // Mapping inside a sequence item: "- key: value" plus following keys at item indent.
        const itemIndent = ind + 2;
        lines[--pos] = { raw: `${' '.repeat(itemIndent)}${rest}`, no: l.no };
        out.push(mapping(itemIndent, depth + 1));
      } else {
        out.push(value(rest, ind, l.no, depth));
      }
      countKey(l.no);
    }
    return out;
  }

  function mapping(indent, depth) {
    const out = Object.create(null);
    while (true) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos];
      const ind = indentOf(l);
      if (ind < indent) break;
      if (ind > indent) throw new YamlError('Unexpected indentation', l.no);
      const t = l.raw.trim();
      if (t.startsWith('- ') || t === '-') break;
      const kv = splitKey(t);
      if (!kv) throw new YamlError('Expected "key: value"', l.no);
      if (kv.key.startsWith('&') || kv.key.startsWith('*')) throw new YamlError('Anchors and aliases are not supported', l.no);
      if (kv.key.startsWith('!')) throw new YamlError('Tags are not supported', l.no);
      if (kv.key === '?') throw new YamlError('Complex keys are not supported', l.no);
      const key = /^["']/.test(kv.key) ? String(scalar(kv.key, l.no, opts)) : kv.key.trim();
      pos++;
      countKey(l.no);
      setKey(out, key, value(kv.rest, ind, l.no, depth), l.no);
    }
    return out;
  }

  skipBlank();
  if (pos >= lines.length) return Object.create(null);
  const startIndent = indentOf(lines[pos]);
  if (startIndent !== 0) throw new YamlError('Document must start at column 0', lines[pos].no);
  const result = node(0, 1);
  skipBlank();
  if (pos < lines.length) throw new YamlError('Unexpected content', lines[pos].no);
  return result;
}

function needsQuotes(s) {
  return s === '' || /^[\s\-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\s$|^(true|false|null|~|yes|no|on|off)$/i.test(s) || INT.test(s) || FLOAT.test(s) || DATE.test(s) || /[\n\r\t]/.test(s);
}

function dumpScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('Non-finite numbers cannot be written as YAML');
    return String(v);
  }
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return needsQuotes(s) ? JSON.stringify(s) : s;
}

/**
 * Serialise plain data (objects, arrays, scalars) to the same YAML subset.
 * @param {Record<string, unknown>} data
 */
export function stringifyYaml(data, indent = 0) {
  const pad = ' '.repeat(indent);
  const out = [];
  for (const [k, v] of Object.entries(data)) {
    if (FORBIDDEN_KEYS.has(k)) throw new TypeError(`Key "${k}" is not allowed`);
    const key = needsQuotes(k) ? JSON.stringify(k) : k;
    if (Array.isArray(v)) {
      if (!v.length) out.push(`${pad}${key}: []`);
      else {
        out.push(`${pad}${key}:`);
        for (const item of v) {
          if (item && typeof item === 'object' && !(item instanceof Date)) {
            const inner = stringifyYaml(item, indent + 4).replace(/^ +/, '');
            out.push(`${pad}  - ${inner}`);
          } else out.push(`${pad}  - ${dumpScalar(item)}`);
        }
      }
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      out.push(`${pad}${key}:`);
      out.push(stringifyYaml(v, indent + 2));
    } else out.push(`${pad}${key}: ${dumpScalar(v)}`);
  }
  return out.join('\n');
}
