/**
 * Frontmatter for Markdown and similar files, with a gray-matter-compatible
 * shape: matter(text) -> { data, content, matter, isEmpty, excerpt }.
 *
 * Only YAML frontmatter (--- fences) is supported, parsed by the strict
 * subset in yaml.js. gray-matter's JavaScript frontmatter engine (---js),
 * which evaluates code, is deliberately not supported.
 */
import { LimitExceededError } from '@foulfoxhacks/ametherian-core';
import { parseYaml, stringifyYaml, YamlError } from './yaml.js';

const BOM = /^﻿/;
const OPEN = /^﻿?---[ \t]*(?:\r?\n|$)/;
const CLOSE = /(^|\r?\n)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/**
 * @param {string | Uint8Array} input
 * @param {{ maxBytes?: number, maxDepth?: number, maxKeys?: number, dates?: 'string' | 'date',
 *           excerpt?: boolean, excerptSeparator?: string }} [options]
 */
export function matter(input, options = {}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const text = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
  const size = new TextEncoder().encode(text).byteLength;
  if (size > maxBytes) {
    throw new LimitExceededError(`Document exceeds ${maxBytes} bytes`, { limit: maxBytes, actual: size, resource: 'frontmatter-document' });
  }
  const open = OPEN.exec(text);
  if (!open) return result(Object.create(null), text.replace(BOM, ''), '', options);
  const rest = text.slice(open[0].length);
  // Closing fence: "---" or "..." on its own line (possibly the very first line: empty frontmatter).
  const close = CLOSE.exec(rest);
  if (!close) throw new YamlError('Frontmatter is not closed with ---');
  const raw = rest.slice(0, close.index);
  const content = rest.slice(close.index + close[0].length);
  const data = raw.trim() === ''
    ? Object.create(null)
    : parseYaml(raw, { maxDepth: options.maxDepth, maxKeys: options.maxKeys, dates: options.dates, maxBytes });
  if (Array.isArray(data) || data === null || typeof data !== 'object') throw new YamlError('Frontmatter must be a mapping');
  return result(data, content, raw, options);
}

function result(data, content, raw, options) {
  const out = { data, content, matter: raw, isEmpty: raw.trim() === '' };
  if (options.excerpt) {
    const sep = options.excerptSeparator ?? '---';
    const i = content.indexOf(sep);
    out.excerpt = i === -1 ? '' : content.slice(0, i).trim();
  }
  return Object.freeze(out);
}

/**
 * Write a document with YAML frontmatter.
 * @param {string} content
 * @param {Record<string, unknown>} data
 */
export function stringify(content, data) {
  const yaml = stringifyYaml(data);
  const body = String(content);
  return `---\n${yaml}${yaml ? '\n' : ''}---\n${body.startsWith('\n') ? body.slice(1) : body}`;
}

/** True if the text starts with a frontmatter fence. */
export function test(text) {
  return OPEN.test(String(text));
}
