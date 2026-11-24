import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOptions } from '../src/config.js';
import { ErrorCodes } from '../src/errors.js';

const schema = {
  timeoutMs: { type: 'integer', min: 0, max: 60_000, default: 10_000 },
  method: { type: 'string', oneOf: ['GET', 'POST'], default: 'GET' },
  url: { type: 'string', required: true, min: 1 },
  retries: { type: 'number', min: 0 },
  onEvent: { type: 'function' },
  signal: { type: 'signal' },
  tags: { type: 'array', max: 2 },
};

function problemsOf(fn) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.code, ErrorCodes.CONFIG);
    return [...err.details.problems];
  }
  assert.fail('expected ConfigError');
}

test('applies defaults and returns frozen null-prototype copy', () => {
  const input = { url: 'https://example.com' };
  const out = validateOptions(input, schema);
  assert.deepEqual({ ...out }, { timeoutMs: 10_000, method: 'GET', url: 'https://example.com' });
  assert.ok(Object.isFrozen(out));
  assert.equal(Object.getPrototypeOf(out), null);
  assert.notEqual(out, input);
});

test('accepts valid values of every type', () => {
  const signal = new AbortController().signal;
  const out = validateOptions(
    { url: 'u', retries: 1.5, onEvent() {}, signal, tags: ['a'], method: 'POST', timeoutMs: 0 },
    schema,
  );
  assert.equal(out.signal, signal);
  assert.equal(out.method, 'POST');
});

test('reports every problem at once', () => {
  const problems = problemsOf(() =>
    validateOptions({ timeoutMs: 1.5, method: 'PUT', retries: -1, tags: [1, 2, 3], extra: true }, schema),
  );
  assert.deepEqual(problems, [
    'extra: unknown option',
    'timeoutMs: expected integer, got number',
    'method: must be one of "GET", "POST"',
    'url: required',
    'retries: must be >= 0, got -1',
    'tags: must be <= 2 (length), got 3',
  ]);
});

test('type mismatches are described clearly', () => {
  assert.deepEqual(problemsOf(() => validateOptions({ url: null }, schema)), ['url: expected string, got null']);
  assert.deepEqual(problemsOf(() => validateOptions({ url: 'u', retries: NaN }, schema)), [
    'retries: expected number, got NaN',
  ]);
  assert.deepEqual(problemsOf(() => validateOptions({ url: 'u', tags: {} }, schema)), [
    'tags: expected array, got object',
  ]);
});

test('string length bounds', () => {
  assert.deepEqual(problemsOf(() => validateOptions({ url: '' }, schema)), ['url: must be >= 1 (length), got 0']);
});

test('explicit undefined falls back to default', () => {
  assert.equal(validateOptions({ url: 'u', timeoutMs: undefined }, schema).timeoutMs, 10_000);
});

test('allowUnknown skips unknown-key check and drops them', () => {
  const out = validateOptions({ url: 'u', other: 1 }, schema, { allowUnknown: true });
  assert.equal('other' in out, false);
});

test('custom validate hook', () => {
  const s = { host: { type: 'string', validate: (v) => (v.includes('/') ? 'must not contain "/"' : undefined) } };
  assert.deepEqual(problemsOf(() => validateOptions({ host: 'a/b' }, s)), ['host: must not contain "/"']);
  assert.equal(validateOptions({ host: 'ab' }, s).host, 'ab');
});

test('non-object options are rejected; null/undefined treated as empty', () => {
  assert.deepEqual(problemsOf(() => validateOptions('x', schema, { name: 'client options' })), [
    'client options: expected object, got string',
  ]);
  assert.deepEqual(problemsOf(() => validateOptions(undefined, schema)), ['url: required']);
  assert.deepEqual(problemsOf(() => validateOptions(null, schema)), ['url: required']);
});

test('inherited keys are ignored (prototype pollution safe)', () => {
  const proto = { url: 'from-proto' };
  const input = Object.create(proto);
  assert.deepEqual(problemsOf(() => validateOptions(input, schema)), ['url: required']);
  const out = validateOptions(JSON.parse('{"url":"u","__proto__":{"polluted":1}}'), schema, { allowUnknown: true });
  assert.equal(out.polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test('bad schema is a programmer error, not ConfigError', () => {
  assert.throws(() => validateOptions({}, { a: { type: 'date' } }), TypeError);
});
