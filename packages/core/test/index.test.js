import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@foulfoxhacks/ametherian-core';

test('package entry exports every public helper', () => {
  for (const name of [
    'AmetherianError', 'AbortError', 'TimeoutError', 'LimitExceededError', 'ConfigError',
    'UnsupportedCapabilityError', 'ErrorCodes', 'isAmetherianError',
    'createDeadline', 'throwIfAborted', 'abortable', 'toAbortError',
    'assertWithinLimit', 'createByteLimitStream', 'collectBytes',
    'redactHeaders', 'redactUrl', 'REDACTED', 'DEFAULT_SENSITIVE_HEADERS', 'DEFAULT_SENSITIVE_QUERY_PARAMS',
    'getRuntimeCapabilities', 'requireCapability',
  ]) {
    assert.ok(name in core, `missing export ${name}`);
  }
});
