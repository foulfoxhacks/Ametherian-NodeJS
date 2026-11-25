# @foulfoxhacks/ametherian-frontmatter

**Status: preview.** Apache-2.0. Not yet published to npm.

A strict, bounded YAML frontmatter parser with the same result shape as `gray-matter`, and no third-party dependencies.

```js
import matter from '@foulfoxhacks/ametherian-frontmatter';

const { data, content } = matter(markdown);                    // dates stay ISO strings
const compat = matter(markdown, { dates: 'date' });            // dates as Date objects, like gray-matter
```

**What it supports:** nested mappings, block sequences (of scalars or mappings), flow `[a, b]` and `{k: v}`, plain, single- and double-quoted strings, `|` and `>` block text with chomping, comments, booleans, null, numbers and ISO dates.

**What it refuses**, with `AMETHERIAN_YAML_INVALID`: anchors and aliases, tags (`!!js/function`, `!include`), merge keys, directives, multiple documents, tab indentation, duplicate keys, complex keys, and the `__proto__`, `constructor` and `prototype` keys. These are the features behind YAML's code-execution, "billion laughs" and prototype-pollution bugs. There is no `---js` engine: frontmatter is never evaluated as code.

**Limits:** document size (1 MiB), nesting depth (16) and key count (10,000). All are configurable, and data objects have a null prototype.

**Verified:** parses all 111 Markdown files of akasammythepuppy.me identically to `gray-matter@4.0.3` (data and content) when given `{ dates: 'date' }`.
