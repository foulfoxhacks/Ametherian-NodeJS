# @foulfoxhacks/ametherian-youtube-chat

**Status: preview.** Apache-2.0. Not yet published to npm.

Reads YouTube live chat from Node.js or Cloudflare Workers, with no third-party dependencies and no YouTube account.

```js
import { liveChat } from '@foulfoxhacks/ametherian-youtube-chat';

const stop = new AbortController();
for await (const { messages, deleted } of liveChat('@LofiGirl', { signal: stop.signal })) {
  for (const m of messages) console.log(m.type, m.author.name, m.text, m.amount ?? '');
}
```

For servers that keep no state between requests, use the two steps directly:

```js
import { findLiveChat, fetchChat } from '@foulfoxhacks/ametherian-youtube-chat';

const chat = await findLiveChat('UCSJ4gkVC6NrvII8umztf0Ow');   // video ID, channel ID or @handle
// chat: { videoId, messages, deleted, continuation, pollMs, clientVersion }
const next = await fetchChat(chat);                              // wait chat.pollMs first
```

- **Targets** are a video ID, a channel ID (`UC…`) or an @handle. Anything else, including URLs, is refused, and requests only go to `https://www.youtube.com`.
- **Messages** have a `type` (`text`, `superchat`, `supersticker`, `membership`, `membership_gift`, `gift`), an `author` (`name`, `channelId`, `badges.owner / moderator / member / verified`), plain `text` (custom emoji as their `:shortcut:`), `amount` for paid items and a `timestamp` in ms. `deleted` lists removed message IDs.
- **View:** `view: 'all'` (default) is YouTube's "Live chat" (every message); `'top'` is "Top chat".
- **Limits:** pages 4 MiB, chat responses 2 MiB, 500 messages per batch, 2 000 characters per message, 10 s per request. All are options.
- **Errors** are typed: `AMETHERIAN_YTCHAT_NOT_LIVE` (no live chat), `AMETHERIAN_YTCHAT_UPSTREAM` (`retryable` for 429 and 5xx; `details.status`), `AMETHERIAN_YTCHAT_PARSE`, plus core's `AMETHERIAN_LIMIT_EXCEEDED`, `AMETHERIAN_ABORTED` and `AMETHERIAN_CONFIG`.

**Caveat:** this reads YouTube's public web pages and the undocumented chat endpoint the web player uses, so it can break when YouTube changes them. Failures are typed rather than guessed. See [the threat model](../../docs/threat-models/youtube-chat.md).
