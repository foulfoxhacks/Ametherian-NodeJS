# @foulfoxhacks/ametherian-schema

**Status: unpublished preview.** Not released to npm, not audited, API may change.

Validation and bounded parsing for untrusted input, with no third-party dependencies.

```js
import { object, string, number, literal, array, parseJson } from '@foulfoxhacks/ametherian-schema';

const User = object({
  name: string({ min: 1, max: 100, trim: true }),
  age: number({ integer: true, min: 0 }).optional(),
  role: literal('admin', 'user').default('user'),
  tags: array(string(), { max: 20 }).optional(),
});

const user = parseJson(requestBody, { maxBytes: 64_000, maxDepth: 16, schema: User });
```

- `parse` throws `SchemaError` (`code: 'AMETHERIAN_SCHEMA_INVALID'`) listing **every** issue with its path. `safeParse` returns `{ ok, value | issues }`.
- Objects are rebuilt from declared keys only. Unknown keys are rejected by default (`unknownKeys: 'strip'` to drop them). Inherited properties are never read.
- `record()` rejects `__proto__`, `constructor` and `prototype` keys and returns a null-prototype object.
- Size limits on arrays and records are checked before items are walked.
- `parseJson` checks byte size and nesting depth **before** `JSON.parse`, drops prototype-polluting keys, and rejects invalid UTF-8.
