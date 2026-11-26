/**
 * YouTube live chat reader: finds a channel's or video's live chat on the
 * public watch page, then polls YouTube's web chat endpoint and normalizes
 * the messages. Edge-portable (fetch only, no Node built-ins), every body is
 * size-bounded, every request has a deadline, and requests only ever go to
 * the fixed YouTube origin: inputs are validated IDs, never URLs.
 */
import { AmetherianError, ConfigError, collectBytes, createDeadline } from '@foulfoxhacks/ametherian-core';

export const YTCHAT_NOT_LIVE = 'AMETHERIAN_YTCHAT_NOT_LIVE';
export const YTCHAT_UPSTREAM = 'AMETHERIAN_YTCHAT_UPSTREAM';
export const YTCHAT_PARSE = 'AMETHERIAN_YTCHAT_PARSE';

export class YouTubeChatError extends AmetherianError {
  /** @param {string} message @param {{ code: string, status?: number, retryable?: boolean, cause?: unknown }} info */
  constructor(message, info) {
    super(message, { code: info.code, retryable: info.retryable ?? false, cause: info.cause, details: { status: info.status ?? null } });
  }
}

const ORIGIN = 'https://www.youtube.com';
const DEFAULTS = Object.freeze({ maxPageBytes: 4 * 1024 * 1024, maxChatBytes: 2 * 1024 * 1024, timeoutMs: 10_000, maxMessages: 500, maxText: 2_000 });
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE = /^@[\p{L}\p{N}._-]{3,30}$/u;
const CONTINUATION = /^[A-Za-z0-9_%=-]{16,4096}$/;
const CLIENT_VERSION = /^\d\.\d{8}\.\d{2}\.\d{2}$/;
const FALLBACK_VERSION = '2.20261125.00.00';

/** Classifies a target: a video ID, a channel ID (UC…) or an @handle. Null when it's none. */
export function parseTarget(input) {
  const s = String(input ?? '').trim();
  if (VIDEO_ID.test(s)) return { kind: 'video', id: s };
  if (CHANNEL_ID.test(s)) return { kind: 'channel', id: s };
  if (HANDLE.test(s)) return { kind: 'handle', id: s };
  return null;
}

function options(opts = {}) {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new ConfigError('A fetch implementation is required', { problems: ['fetch: missing'] });
  return { ...DEFAULTS, ...opts, fetch: fetchImpl };
}

async function request(url, init, o, maxBytes) {
  const deadline = createDeadline(o.timeoutMs, { signal: o.signal });
  try {
    let res;
    try {
      res = await o.fetch(url, { ...init, redirect: 'manual', signal: deadline.signal });
    } catch (cause) {
      throw new YouTubeChatError('YouTube did not answer', { code: YTCHAT_UPSTREAM, retryable: true, cause });
    }
    if (res.status !== 200) {
      res.body?.cancel?.().catch(() => {}); // not awaited: a tee'd body only settles once every branch is cancelled
      throw new YouTubeChatError(`YouTube answered ${res.status}`, { code: YTCHAT_UPSTREAM, status: res.status, retryable: res.status === 429 || res.status >= 500 });
    }
    const bytes = await collectBytes(res.body ?? [], { maxBytes, signal: deadline.signal, resource: 'youtube-response' });
    return new TextDecoder().decode(bytes);
  } finally {
    deadline.dispose();
  }
}

/** The first JSON object assigned after `marker` in a page (e.g. "var ytInitialData = "). */
export function extractJson(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0 || start - at - marker.length > 8) return null;
  let depth = 0, inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html.charCodeAt(i);
    if (inString) {
      if (c === 92) i++;
      else if (c === 34) inString = false;
    } else if (c === 34) inString = true;
    else if (c === 123) depth++;
    else if (c === 125 && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/** The video ID of a watch or /live page, when that page has a live chat; otherwise YTCHAT_NOT_LIVE. */
export function parseWatchPage(html) {
  const data = extractJson(html, 'var ytInitialData =') ?? extractJson(html, 'window["ytInitialData"] =');
  if (!data) throw new YouTubeChatError('The page has no initial data', { code: YTCHAT_PARSE });
  const videoId = data.currentVideoEndpoint?.watchEndpoint?.videoId;
  const chat = data.contents?.twoColumnWatchNextResults?.conversationBar?.liveChatRenderer;
  if (!VIDEO_ID.test(videoId ?? '') || !chat) throw new YouTubeChatError('No live chat on this page (not live, or chat is off)', { code: YTCHAT_NOT_LIVE });
  return { videoId };
}

/**
 * Reads a /live_chat?v= page: the messages already on it, the continuation
 * to poll next and the web client version. `view: 'all'` (default) switches
 * to YouTube's "Live chat" view (every message); 'top' keeps "Top chat".
 * Switching views costs no extra request: it only picks the next continuation.
 */
export function parseChatPage(html, { view = 'all', ...limits } = {}) {
  const data = extractJson(html, 'window["ytInitialData"] =') ?? extractJson(html, 'var ytInitialData =');
  const chat = data?.contents?.liveChatRenderer;
  if (!chat) throw new YouTubeChatError('No live chat on this page (not live, or chat is off)', { code: YTCHAT_NOT_LIVE });
  const page = parseChatResponse({ continuationContents: { liveChatContinuation: chat } }, limits);
  const items = chat.header?.liveChatHeaderRenderer?.viewSelector?.sortFilterSubMenuRenderer?.subMenuItems ?? [];
  const all = items[1]?.continuation?.reloadContinuationData?.continuation;
  if (view === 'all' && CONTINUATION.test(all ?? '')) page.continuation = all;
  if (!page.continuation) throw new YouTubeChatError('The live chat has no continuation', { code: YTCHAT_PARSE });
  const version = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1];
  return { ...page, ended: false, clientVersion: CLIENT_VERSION.test(version ?? '') ? version : FALLBACK_VERSION };
}

const PAGE_HEADERS = { 'Accept-Language': 'en-US,en;q=0.8', Cookie: 'CONSENT=YES+1' };

/**
 * Finds the live chat for a video ID, channel ID or @handle. Returns the video
 * ID, the messages already in chat, the continuation to poll and the client
 * version. A channel or handle costs one extra page (its /live page).
 */
export async function findLiveChat(target, opts) {
  const o = options(opts);
  const t = typeof target === 'string' ? parseTarget(target) : target;
  if (!t) throw new ConfigError('Expected a video ID, a channel ID (UC…) or an @handle', { problems: ['target: invalid'] });
  let videoId = t.id;
  if (t.kind !== 'video') {
    const path = t.kind === 'channel' ? `/channel/${t.id}/live` : `/@${encodeURIComponent(t.id.slice(1))}/live`;
    videoId = parseWatchPage(await request(ORIGIN + path, { headers: PAGE_HEADERS }, o, o.maxPageBytes)).videoId;
  }
  const html = await request(`${ORIGIN}/live_chat?v=${videoId}`, { headers: PAGE_HEADERS }, o, o.maxPageBytes);
  return { videoId, ...parseChatPage(html, o) };
}

const text = (v, max) => {
  if (!v) return '';
  if (typeof v.simpleText === 'string') return v.simpleText.slice(0, max);
  let out = '';
  for (const r of v.runs ?? []) {
    out += typeof r.text === 'string' ? r.text : r.emoji ? (r.emoji.isCustomEmoji ? r.emoji.shortcuts?.[0] ?? '' : r.emoji.emojiId ?? '') : '';
    if (out.length >= max) break;
  }
  return out.slice(0, max);
};

function author(r) {
  const badges = { owner: false, moderator: false, member: false, verified: false };
  for (const b of r.authorBadges ?? []) {
    const badge = b.liveChatAuthorBadgeRenderer ?? {};
    const icon = badge.icon?.iconType;
    if (icon === 'OWNER') badges.owner = true;
    else if (icon === 'MODERATOR') badges.moderator = true;
    else if (icon === 'VERIFIED') badges.verified = true;
    else if (badge.customThumbnail) badges.member = true;
  }
  return { name: text(r.authorName, 100).replace(/^@/, ''), channelId: CHANNEL_ID.test(r.authorExternalChannelId ?? '') ? r.authorExternalChannelId : '', badges };
}

const KINDS = {
  liveChatTextMessageRenderer: 'text',
  liveChatPaidMessageRenderer: 'superchat',
  liveChatPaidStickerRenderer: 'supersticker',
  liveChatMembershipItemRenderer: 'membership',
  liveChatSponsorshipsGiftPurchaseAnnouncementRenderer: 'membership_gift',
  giftMessageViewModel: 'gift',
};

/** One chat item renderer → a normalized message, or null for items this package doesn't model. */
export function normalizeItem(item, maxText = DEFAULTS.maxText) {
  const key = Object.keys(item ?? {}).find((k) => Object.hasOwn(KINDS, k));
  if (!key) return null;
  let r = item[key];
  const type = KINDS[key];
  if (type === 'gift') {
    // View-model shape: plain `content` strings, no channel ID.
    r = { id: r.id, authorName: { simpleText: (r.authorName?.content ?? '').trim() }, message: { simpleText: r.text?.content ?? '' } };
  } else if (type === 'membership_gift') {
    const header = r.header?.liveChatSponsorshipsHeaderRenderer ?? {};
    r = { ...header, id: r.id, timestampUsec: r.timestampUsec, authorExternalChannelId: r.authorExternalChannelId, message: header.primaryText };
  }
  if (typeof r?.id !== 'string' || r.id.length > 200) return null;
  const usec = Number(r.timestampUsec);
  return {
    id: r.id,
    type,
    author: author(r),
    text: text(r.message ?? (type === 'membership' ? r.headerSubtext : null), maxText),
    amount: text(r.purchaseAmountText, 40) || null,
    timestamp: Number.isFinite(usec) ? Math.floor(usec / 1000) : null,
  };
}

/**
 * Parses a get_live_chat response: new messages, deleted message IDs, the next
 * continuation and how long to wait before asking again. `ended` is true when
 * YouTube gives no way to continue (the stream is over).
 */
export function parseChatResponse(json, { maxMessages = DEFAULTS.maxMessages, maxText = DEFAULTS.maxText } = {}) {
  const live = json?.continuationContents?.liveChatContinuation;
  if (!live) return { messages: [], deleted: [], continuation: null, pollMs: 0, ended: true };
  const messages = [], deleted = [];
  for (const action of live.actions ?? []) {
    if (messages.length >= maxMessages) break;
    const add = action.addChatItemAction?.item ?? action.replayChatItemAction?.actions?.[0]?.addChatItemAction?.item;
    if (add) {
      const m = normalizeItem(add, maxText);
      if (m) messages.push(m);
    }
    const gone = action.removeChatItemAction?.targetItemId ?? action.markChatItemAsDeletedAction?.targetItemId;
    if (typeof gone === 'string' && deleted.length < maxMessages) deleted.push(gone);
  }
  let continuation = null, pollMs = 0;
  for (const c of live.continuations ?? []) {
    const d = c.invalidationContinuationData ?? c.timedContinuationData ?? c.liveChatReplayContinuationData ?? c.reloadContinuationData;
    if (d && CONTINUATION.test(d.continuation ?? '')) {
      continuation = d.continuation;
      pollMs = Math.min(Math.max(Number(d.timeoutMs) || 5000, 1000), 30000);
      break;
    }
  }
  return { messages, deleted, continuation, pollMs, ended: !continuation };
}

/** Fetches one page of chat for a continuation. */
export async function fetchChat({ continuation, clientVersion = FALLBACK_VERSION }, opts) {
  const o = options(opts);
  if (!CONTINUATION.test(continuation ?? '')) throw new ConfigError('Invalid continuation', { problems: ['continuation: invalid'] });
  const version = CLIENT_VERSION.test(clientVersion) ? clientVersion : FALLBACK_VERSION;
  const body = JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: version, hl: 'en', gl: 'US' } }, continuation });
  const raw = await request(`${ORIGIN}/youtubei/v1/live_chat/get_live_chat?prettyPrint=false`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, o, o.maxChatBytes);
  let json;
  try { json = JSON.parse(raw); } catch { throw new YouTubeChatError('YouTube sent invalid JSON', { code: YTCHAT_PARSE }); }
  return parseChatResponse(json, o);
}

/**
 * Polls a live chat until it ends or `signal` aborts, yielding each batch of
 * new messages and deleted message IDs. Messages already in chat when you
 * join are skipped unless `includeBacklog` is true.
 */
export async function* liveChat(target, opts = {}) {
  const o = options(opts);
  const boot = await findLiveChat(target, o);
  let state = { continuation: boot.continuation, clientVersion: boot.clientVersion };
  let skip = !o.includeBacklog;
  const seen = new Set();
  let page = boot;
  while (!o.signal?.aborted) {
    // Pages can repeat items; each message and each deletion is reported once.
    const fresh = page.messages.filter((m) => !seen.has(m.id));
    const deleted = page.deleted.filter((id) => !seen.has(`-${id}`));
    for (const m of fresh) seen.add(m.id);
    for (const id of deleted) seen.add(`-${id}`);
    if (seen.size > 5000) seen.clear();
    if (!skip && (fresh.length || deleted.length)) yield { videoId: boot.videoId, messages: fresh, deleted };
    skip = false;
    if (page.ended) return;
    state = { ...state, continuation: page.continuation };
    await new Promise((resolve) => {
      const t = setTimeout(resolve, page.pollMs);
      o.signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
    if (o.signal?.aborted) return;
    page = await fetchChat(state, o);
  }
}
