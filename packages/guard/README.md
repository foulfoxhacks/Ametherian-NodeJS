# @foulfoxhacks/ametherian-guard

**Status: unpublished preview.** Not released to npm, not audited, API may change.
Threat model: [docs/threat-models/guard.md](../../docs/threat-models/guard.md).

Outbound destination policy for code that fetches URLs it did not choose itself
(webhooks, link previews, importers). Blocks private, loopback, link-local,
metadata and other special-purpose addresses by default, including IPv4 hidden
in IPv6 and alternative IPv4 spellings.

```js
import https from 'node:https';
import { createDestinationPolicy } from '@foulfoxhacks/ametherian-guard';

const policy = createDestinationPolicy();          // public addresses, http/https only
const agent = new https.Agent({ lookup: policy.lookup });

const url = policy.checkUrl(userSuppliedUrl);      // 1. check the URL itself
https.get(url, { agent }, (res) => {               // 2. lookup re-checks resolved IPs at connect time
  if (res.headers.location) {
    const next = policy.checkRedirect(url, res.headers.location); // 3. check every redirect hop
  }
});
```

Use **both** `checkUrl` and the `lookup` hook. Node does not call `lookup` for
IP-literal hosts, so `checkUrl` is what catches `http://127.0.0.1/`; `lookup`
is what catches names that resolve to private addresses (including DNS
rebinding).

Blocked requests throw `DestinationBlockedError` (`code: 'AMETHERIAN_DESTINATION_BLOCKED'`)
with `details.reason` and a redacted `details.url`.

| Option | Default | Meaning |
|---|---|---|
| `allowedProtocols` | `['https:', 'http:']` | Permitted URL schemes |
| `allowCategories` | `[]` | Extra address categories to allow, e.g. `['loopback']` for local dev |
| `allowHosts` | `[]` | If set, only these hosts (`example.com`, `*.example.com`) |
| `denyHosts` | `[]` | Always refused |
| `allowPorts` | any | Permitted ports |
| `allowCredentials` | `false` | Allow `user:pass@` in URLs |
| `allowDowngrade` | `false` | Allow https → http redirects |
| `lookup` | `dns.lookup` | Underlying resolver |

Not covered: requests sent through an HTTP proxy (the proxy resolves names),
clients that ignore the `lookup` hook, TLS validation, response size limits.
