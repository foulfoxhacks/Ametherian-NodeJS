import { test } from 'node:test';
import assert from 'node:assert/strict';
import { string, number, boolean, literal, array, object, record, union, unknown, SCHEMA_INVALID, parseJson, jsonDepth } from '../src/index.js';
import { ErrorCodes } from '@foulfoxhacks/ametherian-core';

const issuesOf = (schema, v) => {
  const r = schema.safeParse(v);
  assert.equal(r.ok, false, 'expected failure');
  return r.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
};

test('primitives', () => {
  assert.equal(string().parse('a'), 'a');
  assert.equal(string({ trim: true, min: 1 }).parse('  a '), 'a');
  assert.deepEqual(issuesOf(string({ min: 2, max: 3, pattern: /^[a-z]+$/ }), 'A'), [
    '(root): must have at least 2 characters',
    '(root): does not match required pattern',
  ]);
  assert.equal(number({ integer: true, min: 0, max: 10 }).parse(3), 3);
  assert.deepEqual(issuesOf(number(), NaN), ['(root): expected finite number, got NaN']);
  assert.deepEqual(issuesOf(number(), Infinity), ['(root): expected finite number, got number']);
  assert.deepEqual(issuesOf(number({ integer: true, max: 1 }), 1.5), ['(root): expected integer', '(root): must be <= 1']);
  assert.equal(boolean().parse(false), false);
  assert.deepEqual(issuesOf(boolean(), 'true'), ['(root): expected boolean, got string']);
  assert.equal(literal('a', 'b').parse('b'), 'b');
  assert.deepEqual(issuesOf(literal('a', 1), 'c'), ['(root): expected one of "a", 1']);
});

const User = object({
  name: string({ min: 1 }),
  age: number({ integer: true, min: 0 }).optional(),
  role: literal('admin', 'user').default('user'),
  tags: array(string(), { max: 3 }).optional(),
});

test('objects copy known keys and apply defaults', () => {
  const input = { name: 'Ana', tags: ['x'] };
  const out = User.parse(input);
  assert.deepEqual(out, { name: 'Ana', role: 'user', tags: ['x'] });
  assert.notEqual(out, input);
});

test('objects report every issue with paths', () => {
  assert.deepEqual(issuesOf(User, { age: -1, role: 'root', tags: ['a', 2], extra: 1 }), [
    'name: required',
    'age: must be >= 0',
    'role: expected one of "admin", "user"',
    'tags.1: expected string, got number',
    'extra: unknown key',
  ]);
});

test('strip mode drops unknown keys', () => {
  const s = object({ a: number() }, { unknownKeys: 'strip' });
  assert.deepEqual(s.parse({ a: 1, b: 2 }), { a: 1 });
});

test('prototype pollution payloads cannot reach output', () => {
  const evil = JSON.parse('{"name":"x","__proto__":{"isAdmin":true}}');
  assert.deepEqual(issuesOf(User, evil), ['__proto__: unknown key']);
  const stripped = object({ name: string() }, { unknownKeys: 'strip' }).parse(evil);
  assert.equal(stripped.isAdmin, undefined);
  assert.equal({}.isAdmin, undefined);
  const r = record(number());
  assert.deepEqual(issuesOf(r, JSON.parse('{"a":1,"__proto__":2,"constructor":3}')), [
    '__proto__: forbidden key',
    'constructor: forbidden key',
  ]);
  const ok = r.parse({ a: 1 });
  assert.equal(Object.getPrototypeOf(ok), null);
});

test('inherited properties are not treated as present', () => {
  const input = Object.create({ name: 'inherited' });
  assert.deepEqual(issuesOf(object({ name: string() }), input), ['name: required']);
});

test('arrays enforce size before walking items', () => {
  let walked = 0;
  const item = number().refine(() => {
    walked++;
    return true;
  });
  assert.deepEqual(issuesOf(array(item, { max: 2 }), [1, 2, 3]), ['(root): must have at most 2 items']);
  assert.equal(walked, 0);
});

test('record enforces maxKeys and key schema', () => {
  assert.deepEqual(issuesOf(record(number(), { maxKeys: 1 }), { a: 1, b: 2 }), ['(root): must have at most 1 keys']);
  assert.deepEqual(issuesOf(record(number(), { key: string({ pattern: /^[a-z]+$/ }) }), { A1: 1 }), [
    'A1: does not match required pattern',
  ]);
});

test('union, nullable, refine, transform, unknown', () => {
  const id = union(number({ integer: true }), string({ pattern: /^\d+$/ }).transform(Number));
  assert.equal(id.parse(5), 5);
  assert.equal(id.parse('42'), 42);
  assert.equal(issuesOf(id, 'x').length, 1);
  assert.equal(string().nullable().parse(null), null);
  const even = number().refine((n) => n % 2 === 0, 'must be even');
  assert.deepEqual(issuesOf(even, 3), ['(root): must be even']);
  assert.deepEqual(issuesOf(even, 'x'), ['(root): expected finite number, got string']);
  assert.equal(unknown().parse(undefined), undefined);
});

test('parse throws SchemaError with frozen issues', () => {
  assert.throws(() => User.parse(null), (err) => {
    assert.equal(err.code, SCHEMA_INVALID);
    assert.equal(err.retryable, false);
    assert.match(err.message, /Invalid input at \(root\): expected object, got null/);
    assert.ok(Object.isFrozen(err.details.issues));
    return true;
  });
});

test('jsonDepth ignores brackets inside strings', () => {
  assert.equal(jsonDepth('{"a":[1,{"b":"[[[{{{"}]}'), 3);
  assert.equal(jsonDepth('"\\"[["'), 0);
  assert.equal(jsonDepth('1'), 0);
});

test('parseJson enforces size and depth before parsing', () => {
  assert.throws(() => parseJson('[1]', { maxBytes: 2 }), { code: ErrorCodes.LIMIT_EXCEEDED });
  const deep = '['.repeat(100_000) + ']'.repeat(100_000);
  assert.throws(() => parseJson(deep), (err) => err.code === ErrorCodes.LIMIT_EXCEEDED && err.details.resource === 'json-depth');
  assert.throws(() => parseJson('{"a":', {}), { code: SCHEMA_INVALID });
  assert.throws(() => parseJson('1', { maxDepth: 0 }), { code: ErrorCodes.CONFIG });
});

test('parseJson drops pollution keys and validates with schema', () => {
  const v = parseJson('{"a":1,"__proto__":{"x":1},"nested":{"constructor":{"prototype":1}}}');
  assert.deepEqual(Object.keys(v), ['a', 'nested']);
  assert.deepEqual(Object.keys(v.nested), []);
  assert.deepEqual(parseJson(new TextEncoder().encode('{"name":"z"}'), { schema: User }), { name: 'z', role: 'user' });
  assert.throws(() => parseJson('{"name":1}', { schema: User }), { code: SCHEMA_INVALID });
  assert.throws(() => parseJson(new Uint8Array([0xff])), { code: SCHEMA_INVALID });
  assert.throws(() => parseJson(42), TypeError);
});
