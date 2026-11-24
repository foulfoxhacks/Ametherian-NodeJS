import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactHeaders, redactUrl, REDACTED } from '../src/redact.js';

test('redacts sensitive headers case-insensitively in plain objects', () => {
  const input = { Authorization: 'Bearer abc', 'Content-Type': 'text/plain', COOKIE: 'a=1' };
  const out = redactHeaders(input);
  assert.equal(out.Authorization, REDACTED);
  assert.equal(out.COOKIE, REDACTED);
  assert.equal(out['Content-Type'], 'text/plain');
  assert.equal(input.Authorization, 'Bearer abc', 'input not mutated');
});

test('handles Headers instances and pair arrays', () => {
  const h = new Headers({ 'x-api-key': 'k', accept: '*/*' });
  assert.deepEqual({ ...redactHeaders(h) }, { accept: '*/*', 'x-api-key': REDACTED });
  assert.deepEqual({ ...redactHeaders([['Proxy-Authorization', 'Basic x']]) }, { 'Proxy-Authorization': REDACTED });
});

test('redacts array values and keeps undefined', () => {
  const out = redactHeaders({ 'set-cookie': ['a=1', 'b=2'], authorization: undefined });
  assert.equal(out['set-cookie'], REDACTED);
  assert.equal(out.authorization, undefined);
});

test('supports extra names and custom replacement', () => {
  const out = redactHeaders({ 'X-Session': 's', other: 'o' }, { extra: ['x-session'], replacement: '***' });
  assert.equal(out['X-Session'], '***');
  assert.equal(out.other, 'o');
});

test('result has no prototype (no __proto__ pollution)', () => {
  const out = redactHeaders([['__proto__', 'x']]);
  assert.equal(Object.getPrototypeOf(out), null);
  assert.equal(out.__proto__, 'x');
  assert.equal({}.x, undefined);
});

test('redactUrl strips credentials and secret params', () => {
  const out = redactUrl('https://user:pw@example.com/p?access_token=abc&page=2&API_KEY=z');
  assert.equal(out, 'https://example.com/p?access_token=%5BREDACTED%5D&page=2&API_KEY=%5BREDACTED%5D');
  assert.ok(!out.includes('pw'));
  assert.ok(!out.includes('abc'));
});

test('redactUrl leaves clean URLs unchanged', () => {
  const url = 'https://example.com/a?q=x%20y';
  assert.equal(redactUrl(url), url);
  assert.equal(redactUrl(new URL(url)), url);
});

test('redactUrl handles extras and unparseable input', () => {
  assert.equal(redactUrl('https://e.com/?sid=1', { extra: ['sid'], replacement: 'X' }), 'https://e.com/?sid=X');
  assert.equal(redactUrl('not a url with secret=abc'), '[unparseable URL]');
});
