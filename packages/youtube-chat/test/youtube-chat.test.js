import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseTarget, extractJson, parseWatchPage, parseChatPage, parseChatResponse, findLiveChat, fetchChat, liveChat,
  YTCHAT_NOT_LIVE, YTCHAT_UPSTREAM, YTCHAT_PARSE,
} from '../src/index.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const chatPage = fixture('live-chat-page.txt');
const watchPage = fixture('watch-live.txt');
const synthetic = JSON.parse(fixture('get-live-chat.synthetic.json'));
// Core deadlines unref their timers; keep the loop alive while a fake fetch waits on one.
const keepAlive = setInterval(() => {}, 1000);
after(() => clearInterval(keepAlive));

/** A fetch that answers from a table of URL prefixes (factories, so every call gets a fresh body) and records every call. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [prefix, answer] of routes) if (url.startsWith(prefix)) return answer(url, init);
    return new Response('nope', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

test('targets: video IDs, channel IDs and handles; everything else is refused', () => {
  assert.deepEqual(parseTarget('4t4AQ15yj1M'), { kind: 'video', id: '4t4AQ15yj1M' });
  assert.deepEqual(parseTarget('UCSJ4gkVC6NrvII8umztf0Ow'), { kind: 'channel', id: 'UCSJ4gkVC6NrvII8umztf0Ow' });
  assert.deepEqual(parseTarget(' @LofiGirl '), { kind: 'handle', id: '@LofiGirl' });
  for (const bad of ['', 'https://evil.example/x', '../watch', '@a', '4t4AQ15yj1M/../x', 'UC123', null]) assert.equal(parseTarget(bad), null, String(bad));
});

test('extractJson stops at the matching brace and ignores braces inside strings', () => {
  assert.deepEqual(extractJson('x = {"a":"}{\\"","b":{"c":1}}; y = {"z":2}', 'x ='), { a: '}{"', b: { c: 1 } });
  assert.equal(extractJson('nothing here', 'x ='), null);
  assert.equal(extractJson('x = {"broken": }', 'x ='), null);
});

test('watch page (recorded): video ID of a live stream with chat', () => {
  assert.deepEqual(parseWatchPage(watchPage), { videoId: '4t4AQ15yj1M' });
  assert.throws(() => parseWatchPage('<html>no data</html>'), { code: YTCHAT_PARSE });
  assert.throws(() => parseWatchPage('<script>var ytInitialData = {"contents":{}};</script>'), { code: YTCHAT_NOT_LIVE });
});

test('live chat page (recorded, anonymized): messages, emoji, badges, gifts, deletions, continuation', () => {
  const page = parseChatPage(chatPage);
  const text = page.messages.filter((m) => m.type === 'text');
  assert.equal(text.length, 5);
  assert.deepEqual(text[0].author, { name: 'viewer1', channelId: 'UCTESTVIEWER01xxxxxxxxx'.padEnd(24, 'x'), badges: { owner: false, moderator: false, member: false, verified: false } });
  assert.ok(text.some((m) => m.text === '!sr Björk Jóga'));
  assert.ok(text.some((m) => /:[a-z-]+:/.test(m.text)), 'custom emoji become their shortcut');
  assert.ok(text.find((m) => m.author.name === 'viewer3').author.badges.moderator);
  assert.ok(text.every((m) => Number.isInteger(m.timestamp) && m.timestamp > 1.7e12));
  const gift = page.messages.find((m) => m.type === 'gift');
  assert.equal(gift.author.name, 'giftgiver'); assert.equal(gift.text, 'sent Star');
  assert.equal(page.messages.some((m) => /Welcome to live chat/.test(m.text)), false, 'system notices are not messages');
  assert.equal(page.deleted.length, 1);
  assert.equal(page.pollMs, 10000);
  assert.equal(page.clientVersion, '2.20261125.00.00');
  const top = parseChatPage(chatPage, { view: 'top' });
  assert.notEqual(page.continuation, top.continuation, '"Live chat" view uses its own continuation');
  assert.throws(() => parseChatPage(watchPage), { code: YTCHAT_NOT_LIVE });
});

test('chat responses (synthetic): paid, membership, gifted memberships, owner and verified badges, bounds', () => {
  const page = parseChatResponse(synthetic);
  const by = Object.fromEntries(page.messages.map((m) => [m.id, m]));
  assert.deepEqual([by['paid-1'].type, by['paid-1'].amount, by['paid-1'].text], ['superchat', '$5.00', '!sr lofi beats']);
  assert.deepEqual([by['sticker-1'].type, by['sticker-1'].amount, by['sticker-1'].text], ['supersticker', '€2.00', '']);
  assert.deepEqual([by['member-1'].type, by['member-1'].text, by['member-1'].author.badges.member], ['membership', 'Welcome to the club', true]);
  assert.deepEqual([by['giftpurchase-1'].type, by['giftpurchase-1'].author.name, by['giftpurchase-1'].text], ['membership_gift', 'gifter', 'Gifted 5 memberships']);
  assert.equal(by['owner-1'].text, 'hi 🦊');
  assert.deepEqual(by['owner-1'].author.badges, { owner: true, moderator: false, member: false, verified: true });
  assert.equal(by['placeholder-1'], undefined);
  assert.equal(Object.getPrototypeOf(by), Object.prototype);
  assert.equal(page.messages.find((m) => m.text === 'odd id, bad channel').author.channelId, '');
  assert.deepEqual(page.deleted, ['old-1']);
  assert.deepEqual([page.continuation, page.pollMs, page.ended], ['0ofMyANyntheticNextContinuationToken01', 3500, false]);
  assert.equal(parseChatResponse(synthetic, { maxMessages: 2 }).messages.length, 2);
  assert.ok(parseChatResponse({ continuationContents: { liveChatContinuation: { actions: [{ addChatItemAction: { item: { liveChatTextMessageRenderer: { id: 'x', message: { simpleText: 'a'.repeat(5000) } } } } }] } } }).messages[0].text.length <= 2000);
  assert.deepEqual(parseChatResponse({}), { messages: [], deleted: [], continuation: null, pollMs: 0, ended: true });
});

test('findLiveChat: handle → /live page → /live_chat page; only the fixed YouTube origin is requested', async () => {
  const f = fakeFetch([
    ['https://www.youtube.com/@LofiGirl/live', () => new Response(watchPage)],
    ['https://www.youtube.com/live_chat?v=4t4AQ15yj1M', () => new Response(chatPage)],
  ]);
  const chat = await findLiveChat('@LofiGirl', { fetch: f });
  assert.equal(chat.videoId, '4t4AQ15yj1M');
  assert.equal(chat.messages.length, 6);
  assert.deepEqual(f.calls.map((c) => c.url), ['https://www.youtube.com/@LofiGirl/live', 'https://www.youtube.com/live_chat?v=4t4AQ15yj1M']);
  assert.ok(f.calls.every((c) => c.init.redirect === 'manual'));
  assert.ok(f.calls.every((c) => /^Mozilla\/5\.0 .*Chrome\//.test(c.init.headers['User-Agent'])), 'a browser User-Agent on every request');
  assert.equal(f.calls[0].init.headers['Accept-Language'], 'en-US,en;q=0.8', 'page headers are kept');
  await assert.rejects(findLiveChat('@LofiGirl', { fetch: f, userAgent: 'bad\r\nInjected: 1' }), { code: 'AMETHERIAN_CONFIG' });
  await assert.rejects(findLiveChat('https://evil.example/', { fetch: f }), { code: 'AMETHERIAN_CONFIG' });
});

test('upstream failures: status codes, oversized bodies, timeouts', async () => {
  await assert.rejects(findLiveChat('4t4AQ15yj1M', { fetch: fakeFetch([['https://', () => new Response('', { status: 429 })]]) }), (e) => e.code === YTCHAT_UPSTREAM && e.retryable && e.details.status === 429);
  await assert.rejects(findLiveChat('4t4AQ15yj1M', { fetch: fakeFetch([['https://', () => new Response('', { status: 302, headers: { Location: 'https://consent.youtube.com/' } })]]) }), (e) => e.code === YTCHAT_UPSTREAM && !e.retryable);
  await assert.rejects(findLiveChat('4t4AQ15yj1M', { fetch: fakeFetch([['https://', () => new Response('x'.repeat(2000))]]), maxPageBytes: 1000 }), { code: 'AMETHERIAN_LIMIT_EXCEEDED' });
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  await assert.rejects(findLiveChat('4t4AQ15yj1M', { fetch: hang, timeoutMs: 20 }), { code: YTCHAT_UPSTREAM });
  await assert.rejects(fetchChat({ continuation: 'x' }, { fetch: hang }), { code: 'AMETHERIAN_CONFIG' });
  await assert.rejects(fetchChat({ continuation: '0ofMyANyntheticNextContinuationToken01' }, { fetch: fakeFetch([['https://', () => new Response('{not json')]]) }), { code: YTCHAT_PARSE });
});

test('fetchChat posts the continuation to the web chat endpoint', async () => {
  const f = fakeFetch([['https://www.youtube.com/youtubei/v1/live_chat/get_live_chat', () => new Response(JSON.stringify(synthetic))]]);
  const page = await fetchChat({ continuation: '0ofMyANyntheticNextContinuationToken01', clientVersion: 'evil"version' }, { fetch: f });
  assert.equal(page.messages.length, 6);
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers['Content-Type'], 'application/json');
  assert.match(f.calls[0].init.headers['User-Agent'], /Chrome\//);
  assert.equal(body.continuation, '0ofMyANyntheticNextContinuationToken01');
  assert.equal(body.context.client.clientName, 'WEB');
  assert.match(body.context.client.clientVersion, /^2\.\d{8}\.\d{2}\.\d{2}$/, 'untrusted client versions are replaced');
});

test('liveChat: skips the backlog, yields new messages once, stops when the stream ends; abort rejects', async () => {
  let polls = 0;
  const f = fakeFetch([
    ['https://www.youtube.com/live_chat?v=', () => new Response(chatPage.replace('"timeoutMs":10000', '"timeoutMs":1'))],
    ['https://www.youtube.com/youtubei/', () => {
      polls++;
      const json = structuredClone(synthetic);
      json.continuationContents.liveChatContinuation.continuations[0].timedContinuationData.timeoutMs = 1;
      if (polls === 2) delete json.continuationContents.liveChatContinuation.continuations;
      return new Response(JSON.stringify(json));
    }],
  ]);
  const batches = [];
  for await (const b of liveChat('4t4AQ15yj1M', { fetch: f })) batches.push(b);
  assert.equal(batches.length, 1, 'backlog skipped; the repeated second page adds nothing new');
  assert.equal(batches[0].messages.length, 6);
  assert.equal(polls, 2);

  const aborted = liveChat('4t4AQ15yj1M', { fetch: fakeFetch([['https://www.youtube.com/live_chat?v=', () => new Response(chatPage)]]), signal: AbortSignal.abort() });
  await assert.rejects(aborted.next(), { code: 'AMETHERIAN_ABORTED' }, 'an aborted signal stops before anything is read');
});
