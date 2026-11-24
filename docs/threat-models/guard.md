# Threat model: `@foulfoxhacks/ametherian-guard` (destination policy)

Status: draft for review · Scope: outbound request destinations · Date: 2026-11-24

## Purpose

`ametherian-guard` decides whether an outbound connection may go to a given
URL or IP address. It is meant to sit in front of HTTP clients (including the
future `ametherian-http`) so that applications which fetch user-supplied URLs
do not get turned into a proxy into private networks.

It is a **policy helper**, not a firewall. It cannot protect connections it is
not asked about.

## Assets

- Internal services reachable from the host (admin panels, databases, caches)
- Cloud instance metadata endpoints (for example `169.254.169.254`, `fd00:ec2::254`)
- Credentials attached to requests (headers, URL userinfo)
- Loopback services on the host itself

## Trust boundaries

| Input | Trusted? | Notes |
|---|---|---|
| Policy options passed by the application | Trusted | Validated with `validateOptions`; bad config fails fast |
| URL to fetch | **Untrusted** | May come from end users or remote documents |
| `Location` header on redirects | **Untrusted** | Must be checked again like a new URL |
| DNS answers | **Untrusted** | Can change between check and connect (rebinding) |

## Threats and mitigations

| # | Threat | Mitigation in guard | Residual risk |
|---|---|---|---|
| T1 | SSRF to private, loopback, link-local, CGNAT, multicast, reserved, documentation or unspecified ranges via an IP literal | `classifyAddress` maps IPv4/IPv6 to IANA special-purpose categories; only `public` is allowed by default | New special-purpose ranges need table updates |
| T2 | Alternative IP spellings (`2130706433`, `0x7f.1`, `127.1`, `[::ffff:7f00:1]`) | URLs are parsed with WHATWG `URL`, which normalises IPv4 forms; IPv6 is expanded to 16 bytes before classification | Callers that bypass `URL` parsing are not covered |
| T3 | IPv4 hidden inside IPv6 (IPv4-mapped `::ffff:0:0/96`, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`) | Embedded IPv4 is extracted and classified; the stricter result wins | Other tunnelling schemes (for example Teredo) are classified as `reserved` and blocked, not decoded |
| T4 | Hostnames that resolve to private addresses | `createDestinationPolicy().lookup` wraps `dns.lookup`, checks **every** resolved address at connect time and fails if any is blocked | Only effective when the HTTP client is configured to use this `lookup` |
| T5 | DNS rebinding (public at check time, private at connect time) | Checking happens inside `lookup`, at the moment the socket address is chosen, not in a separate earlier step | Clients with their own resolver or connection reuse across hosts must be configured to use the guard |
| T6 | Redirect to a blocked destination or protocol | `checkRedirect(from, to)` resolves `Location` against the previous URL and runs the full URL policy again | Clients must call it for every hop |
| T7 | HTTPS → HTTP downgrade on redirect | Blocked by default (`allowDowngrade: false`) | — |
| T8 | Non-HTTP schemes (`file:`, `gopher:`, `ftp:`, `data:`) | Only `https:` and `http:` allowed by default | — |
| T9 | Credentials in URL userinfo used for parser confusion (`https://good.com@evil.com/`) or leaked to third parties | URLs with username/password rejected by default (`allowCredentials: false`) | — |
| T10 | Local hostnames (`localhost`, `*.localhost`, `*.internal`, `metadata.google.internal`) | Treated as blocked names before DNS | Custom internal suffixes need `denyHosts` |
| T11 | Unexpected ports (for example SMTP, Redis) | Optional `allowPorts` allow-list | Not enforced unless configured |
| T12 | Error messages leaking secrets | Block errors include the redacted URL (`redactUrl`) | — |

## Out of scope

- TLS validation (left to the TLS stack)
- Response size, timeouts and decompression limits (see `ametherian-core` limits and future `ametherian-http`)
- Proxies: when an HTTP proxy is used, the proxy resolves names, so the guard must run at the proxy or the proxy must be trusted
- Raw sockets, WebSockets, and other clients that do not use the guard

## Defaults

```
allowedProtocols: ['https:', 'http:']
allowCategories:  []            // only 'public' addresses
allowCredentials: false
allowDowngrade:   false
allowHosts:       []            // empty = any host that passes the other checks
denyHosts:        []
allowPorts:       undefined     // any port
```

## Verification

Unit tests cover every category in T1–T3, the alternative spellings in T2,
rebinding-style lookups returning mixed public/private answers (T4/T5),
redirect and downgrade cases (T6/T7), schemes (T8), credentials (T9) and
local names (T10). An integration test should be added once
`ametherian-http` exists, connecting through a real `http.Agent` with the
guard's `lookup`.
