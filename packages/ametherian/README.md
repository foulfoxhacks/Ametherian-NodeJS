# @foulfoxhacks/ametherian

**Status: unpublished preview.** Not released to npm, not audited.

Umbrella package that re-exports each Ametherian package as a namespace. Prefer the focused packages in real projects, since they keep installs small.

```js
import { http, guard, schema } from '@foulfoxhacks/ametherian';

const client = http.createHttpClient({ policy: guard.createDestinationPolicy() });
```

Namespaces: `core`, `guard`, `schema`, `cache`, `resilience`, `observability`, `http`, `security`. `ametherian-testing` is left out on purpose, because it is for tests only.
