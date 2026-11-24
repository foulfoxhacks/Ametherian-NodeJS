# Threat model: `@foulfoxhacks/ametherian-schema`

Status: draft for review · Scope: validation and parsing of untrusted data · Date: 2026-11-24

## Purpose

Turn untrusted values (request bodies, files, API responses) into checked,
copied values the application can rely on.

## Trust boundaries

| Input | Trusted? |
|---|---|
| Schemas written by the application | Trusted |
| Values passed to `parse` / `safeParse` / `parseJson` | **Untrusted** |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| S1 | Prototype pollution via `__proto__`, `constructor`, `prototype` keys | `object()` rebuilds from declared keys only; `record()` rejects these keys and returns null-prototype objects; `parseJson` drops them during parsing | `unknown()` passes values through unchanged by design |
| S2 | Mass assignment (extra fields reaching the app) | Unknown keys rejected by default; `strip` mode drops them | — |
| S3 | Inherited properties treated as data | Only own properties are read (`Object.hasOwn`) | — |
| S4 | Stack overflow / CPU from deeply nested JSON | `parseJson` scans nesting depth before `JSON.parse` (`maxDepth`, default 64) | Schemas themselves recurse over accepted depth |
| S5 | Memory exhaustion from large inputs | `parseJson` `maxBytes` (default 1 MB) checked first; array/record size limits checked before walking items | Strings have no default max length; set `max` |
| S6 | Type confusion (`"1"` vs `1`, `NaN`, `Infinity`) | Strict type checks; numbers must be finite; no implicit coercion | `transform` can coerce when the app asks |
| S7 | ReDoS through `pattern` | Patterns come from trusted schemas | A badly written pattern can still be slow; keep `max` on strings that use patterns |
| S8 | Invalid UTF-8 smuggling | `parseJson` decodes bytes with a fatal decoder | — |
| S9 | Error messages echoing attacker data | Issues contain paths and fixed messages, not input values | Keys appear in paths |

## Verification

`packages/schema/test` covers S1–S6 and S8; `packages/testing` fuzzes
`parseJson` + schema with 500 hostile inputs and asserts only typed errors are
thrown and nothing is polluted.
