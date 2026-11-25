import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matter, stringify, test as hasFrontmatter, parseYaml, stringifyYaml, YAML_INVALID } from '../src/index.js';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

const plain = (v) => JSON.parse(JSON.stringify(v));

test('parses typical blog frontmatter', () => {
  const doc = `---
title: "Life update: after moving"
summary: A short note & a longer one
date: 2026-10-24
draft: false
imageWidth: 1200
ratio: 1.5
tags:
  - life
  - "moving: notes"
  - 2026
empty:
nothing: null
---
# Heading

Body text.
`;
  const r = matter(doc);
  assert.deepEqual(plain(r.data), {
    title: 'Life update: after moving',
    summary: 'A short note & a longer one',
    date: '2026-10-24',
    draft: false,
    imageWidth: 1200,
    ratio: 1.5,
    tags: ['life', 'moving: notes', 2026],
    empty: null,
    nothing: null,
  });
  assert.equal(r.content, '# Heading\n\nBody text.\n');
  assert.equal(r.isEmpty, false);
  assert.equal(Object.getPrototypeOf(r.data), null);
});

test('nested mappings, sequences of mappings, flow collections, comments', () => {
  const y = parseYaml(`# top comment
author:
  name: Sammy   # trailing comment
  links:
    - label: Site
      url: https://akasammythepuppy.me/#top
    - label: "Dev"
      url: 'https://foulfoxhacks.dev'
flags: [a, "b, c", 3, true]
point: {x: 1, y: "two"}
`);
  assert.deepEqual(plain(y), {
    author: { name: 'Sammy', links: [{ label: 'Site', url: 'https://akasammythepuppy.me/#top' }, { label: 'Dev', url: 'https://foulfoxhacks.dev' }] },
    flags: ['a', 'b, c', 3, true],
    point: { x: 1, y: 'two' },
  });
});

test('block scalars: literal, folded and chomping', () => {
  const y = parseYaml(`lit: |
  line one
    indented
  line three
fold: >
  folded
  text

  new para
strip: |-
  no newline
keep: |+
  keep

end: x
`);
  assert.equal(y.lit, 'line one\n  indented\nline three\n');
  assert.equal(y.fold, 'folded text\nnew para\n');
  assert.equal(y.strip, 'no newline');
  assert.equal(y.keep, 'keep\n\n');
  assert.equal(y.end, 'x');
});

test('quoting rules and escapes', () => {
  const y = parseYaml(`a: 'it''s'
b: "tab\\tand \\"quote\\" \\u00e9"
c: "#not a comment"
d: plain # comment
e: yes
f: '123'
g: 0x1F
`);
  assert.equal(y.a, "it's");
  assert.equal(y.b, 'tab\tand "quote" é');
  assert.equal(y.c, '#not a comment');
  assert.equal(y.d, 'plain');
  assert.equal(y.e, 'yes', 'YAML 1.2 core schema: "yes" stays a string');
  assert.equal(y.f, '123');
  assert.equal(y.g, '0x1F');
});

test('dates can be returned as Date objects', () => {
  const y = parseYaml('d: 2026-10-24\nt: 2026-10-24T10:30:00Z\n', { dates: 'date' });
  assert.ok(y.d instanceof Date);
  assert.equal(y.d.toISOString(), '2026-10-24T00:00:00.000Z');
  assert.equal(y.t.toISOString(), '2026-10-24T10:30:00.000Z');
});

test('refuses the dangerous YAML features', () => {
  const cases = {
    'anchor': 'a: &x 1\nb: *x\n',
    'alias': 'b: *x\n',
    'tag': 'a: !!js/function "function(){}"\n',
    'custom tag': 'a: !include secrets.yml\n',
    'merge key': 'base:\n  a: 1\n<<: x\n',
    'proto key': '__proto__:\n  polluted: true\n',
    'constructor key': 'constructor: 1\n',
    'quoted proto key': '"__proto__": 1\n',
    'flow proto key': 'a: {__proto__: 1}\n',
    'duplicate key': 'a: 1\na: 2\n',
    'tab indent': 'a:\n\tb: 1\n',
    'second document': 'a: 1\n---\nb: 2\n',
    'directive': '%YAML 1.2\na: 1\n',
    'complex key': '? a\n: b\n',
    'nested flow': 'a: [[1, 2]]\n',
  };
  for (const [name, src] of Object.entries(cases)) {
    assert.throws(() => parseYaml(src), { code: YAML_INVALID }, name);
  }
  assert.equal({}.polluted, undefined);
});

test('limits: size, depth, key count', () => {
  assert.throws(() => parseYaml(`a: ${'x'.repeat(300_000)}`), { code: ErrorCodes.LIMIT_EXCEEDED });
  let deep = '';
  for (let i = 0; i < 40; i++) deep += `${'  '.repeat(i)}k${i}:\n`;
  deep += `${'  '.repeat(40)}v: 1\n`;
  assert.throws(() => parseYaml(deep), { code: ErrorCodes.LIMIT_EXCEEDED });
  const many = Array.from({ length: 50 }, (_, i) => `k${i}: ${i}`).join('\n');
  assert.throws(() => parseYaml(many, { maxKeys: 10 }), { code: ErrorCodes.LIMIT_EXCEEDED });
  assert.throws(() => matter(`---\na: 1\n---\n${'x'.repeat(2000)}`, { maxBytes: 1000 }), { code: ErrorCodes.LIMIT_EXCEEDED });
});

test('documents without frontmatter, empty frontmatter, BOM and CRLF', () => {
  const none = matter('# Just markdown\n');
  assert.equal(none.content, '# Just markdown\n');
  assert.equal(none.isEmpty, true);
  assert.deepEqual(plain(none.data), {});
  const empty = matter('---\n---\nbody');
  assert.equal(empty.content, 'body');
  assert.equal(empty.isEmpty, true);
  const bom = matter('\uFEFF---\r\ntitle: x\r\n---\r\nbody\r\n');
  assert.equal(bom.data.title, 'x');
  assert.equal(bom.content, 'body\r\n');
  assert.equal(hasFrontmatter('---\na: 1\n---\n'), true);
  assert.equal(hasFrontmatter('a: 1'), false);
  assert.throws(() => matter('---\ntitle: never closed\n'), { code: YAML_INVALID });
  assert.throws(() => matter('---\n- a\n- b\n---\n'), { code: YAML_INVALID }, 'frontmatter must be a mapping');
});

test('excerpt option', () => {
  const r = matter('---\na: 1\n---\nIntro text\n<!-- more -->\nRest', { excerpt: true, excerptSeparator: '<!-- more -->' });
  assert.equal(r.excerpt, 'Intro text');
});

test('stringify round-trips through matter', () => {
  const data = { title: 'A: B', date: '2026-10-24', draft: false, n: 3, tags: ['x', 'y z'], nested: { k: 'v' }, items: [{ a: 1, b: 'two' }] };
  const text = stringify('Body\n', data);
  const back = matter(text);
  assert.deepEqual(plain(back.data), data);
  assert.equal(back.content, 'Body\n');
  assert.throws(() => stringifyYaml({ ['__proto__']: 1 }), TypeError);
});
