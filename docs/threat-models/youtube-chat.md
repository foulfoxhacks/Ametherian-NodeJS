# Threat model: `@foulfoxhacks/ametherian-youtube-chat`

Status: draft for review · Scope: reading YouTube live chat from Node.js or Cloudflare Workers · Date: 2026-11-26

## Purpose

Find a live stream's chat from a video ID, channel ID or @handle, poll it, and
hand the application normalized messages it can act on (for example song
requests). It reads YouTube's public web pages and the web chat endpoint those
pages use; it has no YouTube account, cookies or API key.

## Trust boundaries

| Input | Trusted? |
|---|---|
| Options written by the application (`fetch`, limits, `view`) | Trusted |
| The target (video ID, channel ID, handle) and continuation tokens | **Untrusted** (often typed by a viewer or another service) |
| Every byte YouTube returns, including chat text and author names | **Untrusted** |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| Y1 | SSRF / open fetch through the target | Targets must match a video ID, `UC…` channel ID or @handle pattern; URLs are built against the fixed `https://www.youtube.com` origin; continuations are a fixed character set and go only into the JSON body | — |
| Y2 | Redirects to other hosts (consent pages, captive portals) | `redirect: 'manual'`; any non-200 is an `AMETHERIAN_YTCHAT_UPSTREAM` error | — |
| Y3 | Memory exhaustion from large pages or responses | `collectBytes` caps pages (4 MiB) and chat responses (2 MiB) while streaming; per-batch message count (500) and per-message text (2 000 chars) are capped | — |
| Y4 | Hung connections | Every request has a deadline (10 s) that also follows the caller's `signal` | — |
| Y5 | Prototype pollution or type confusion from response JSON | Output objects are built field by field from known renderers; IDs and channel IDs are validated; unknown renderers are dropped | — |
| Y6 | Header or request injection through the client version | Only versions matching `d.dddddddd.dd.dd` are sent; anything else is replaced with a known version | — |
| Y7 | Chat text used unsafely by the application (XSS, command injection) | Messages are plain text, never HTML | Escaping and command parsing are the application's job |
| Y8 | YouTube changes its page or chat format | Parse failures are typed (`AMETHERIAN_YTCHAT_PARSE`, `AMETHERIAN_YTCHAT_NOT_LIVE`); unknown items are skipped, not guessed | The package needs updates when YouTube changes; it relies on an undocumented endpoint |
| Y9 | Rate limiting or blocking by YouTube | 429 and 5xx are `retryable`; `liveChat` waits for YouTube's own `timeoutMs` (clamped to 1–30 s) between polls | Heavy use from one IP can still be blocked |

## Verification

`packages/youtube-chat/test` covers Y1–Y6 and the parsers: an anonymized,
recorded `/live_chat` page and watch page (real structure; names, channel IDs
and text replaced) and a synthetic `get_live_chat` response for paid,
membership and deletion items the recording did not contain. The live
endpoint is not called in CI.
