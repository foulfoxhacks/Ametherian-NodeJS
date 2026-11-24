import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AmetherianError,
  AbortError,
  TimeoutError,
  LimitExceededError,
  ConfigError,
  UnsupportedCapabilityError,
  ErrorCodes,
  isAmetherianError,
} from '../src/errors.js';

test('base error has stable defaults', () => {
  const err = new AmetherianError('boom');
  assert.equal(err.code, ErrorCodes.GENERIC);
  assert.equal(err.retryable, false);
  assert.equal(err.name, 'AmetherianError');
  assert.deepEqual(err.details, {});
  assert.ok(err instanceof Error);
});

test('cause is preserved and omitted when absent', () => {
  const root = new Error('root');
  assert.equal(new AmetherianError('x', { cause: root }).cause, root);
  assert.equal('cause' in new AmetherianError('x'), false);
});

test('subclasses set codes, names and retryability', () => {
  const cases = [
    [new AbortError(), ErrorCodes.ABORTED, 'AbortError', false],
    [new TimeoutError(), ErrorCodes.TIMEOUT, 'TimeoutError', true],
    [new LimitExceededError('big', { limit: 1 }), ErrorCodes.LIMIT_EXCEEDED, 'LimitExceededError', false],
    [new ConfigError('bad'), ErrorCodes.CONFIG, 'ConfigError', false],
    [new UnsupportedCapabilityError('fetch'), ErrorCodes.UNSUPPORTED, 'UnsupportedCapabilityError', false],
  ];
  for (const [err, code, name, retryable] of cases) {
    assert.equal(err.code, code);
    assert.equal(err.name, name);
    assert.equal(err.retryable, retryable);
    assert.ok(err instanceof AmetherianError);
  }
});

test('subclass code cannot be overridden by options', () => {
  const err = new TimeoutError('t', { code: 'OTHER', retryable: false });
  assert.equal(err.code, ErrorCodes.TIMEOUT);
  assert.equal(err.retryable, false);
});

test('details are frozen and carry structured info', () => {
  const err = new LimitExceededError('too big', { limit: 10, actual: 11, resource: 'body' });
  assert.deepEqual({ ...err.details }, { resource: 'body', limit: 10, actual: 11 });
  assert.ok(Object.isFrozen(err.details));
  const cfg = new ConfigError('bad', { problems: ['a', 'b'] });
  assert.deepEqual([...cfg.details.problems], ['a', 'b']);
  assert.ok(Object.isFrozen(cfg.details.problems));
  assert.equal(new UnsupportedCapabilityError('ws').details.capability, 'ws');
});

test('toJSON is serialisable and excludes stack', () => {
  const json = JSON.parse(JSON.stringify(new TimeoutError('late')));
  assert.deepEqual(json, {
    name: 'TimeoutError',
    code: ErrorCodes.TIMEOUT,
    message: 'late',
    retryable: true,
    details: {},
  });
});

test('isAmetherianError uses a brand, not instanceof', () => {
  assert.equal(isAmetherianError(new AbortError()), true);
  assert.equal(isAmetherianError(new Error('x')), false);
  assert.equal(isAmetherianError(null), false);
  assert.equal(isAmetherianError({ code: ErrorCodes.GENERIC }), false);
  const foreign = Object.defineProperty(new Error('x'), Symbol.for('ametherian.error'), { value: true });
  assert.equal(isAmetherianError(foreign), true);
});

test('ErrorCodes is frozen', () => {
  assert.ok(Object.isFrozen(ErrorCodes));
});
