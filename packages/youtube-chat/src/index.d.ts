import type { AmetherianError } from '@foulfoxhacks/ametherian-core';

export declare const YTCHAT_NOT_LIVE: 'AMETHERIAN_YTCHAT_NOT_LIVE';
export declare const YTCHAT_UPSTREAM: 'AMETHERIAN_YTCHAT_UPSTREAM';
export declare const YTCHAT_PARSE: 'AMETHERIAN_YTCHAT_PARSE';
export declare class YouTubeChatError extends AmetherianError {
  constructor(message: string, info: { code: string; status?: number; retryable?: boolean; cause?: unknown });
  readonly details: Readonly<{ status: number | null }>;
}

export type Target = { kind: 'video' | 'channel' | 'handle'; id: string };
export interface ChatOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Per request. Default 10 000. */
  timeoutMs?: number;
  /** Watch, /live and /live_chat pages. Default 4 MiB. */
  maxPageBytes?: number;
  /** One get_live_chat response. Default 2 MiB. */
  maxChatBytes?: number;
  /** Per batch. Default 500. */
  maxMessages?: number;
  /** Characters per message. Default 2 000. */
  maxText?: number;
  /** 'all' (default): YouTube's "Live chat" view. 'top': "Top chat". */
  view?: 'all' | 'top';
}
export interface ChatMessage {
  readonly id: string;
  readonly type: 'text' | 'superchat' | 'supersticker' | 'membership' | 'membership_gift' | 'gift';
  readonly author: { name: string; channelId: string; badges: { owner: boolean; moderator: boolean; member: boolean; verified: boolean } };
  readonly text: string;
  /** Display amount of a Super Chat or Super Sticker, e.g. "$5.00". */
  readonly amount: string | null;
  /** Milliseconds since the epoch. */
  readonly timestamp: number | null;
}
export interface ChatPage {
  readonly messages: ChatMessage[];
  readonly deleted: string[];
  readonly continuation: string | null;
  readonly pollMs: number;
  readonly ended: boolean;
}
export interface LiveChat extends ChatPage {
  readonly videoId: string;
  readonly continuation: string;
  readonly clientVersion: string;
}

export declare function parseTarget(input: string): Target | null;
export declare function extractJson(html: string, marker: string): any;
export declare function parseWatchPage(html: string): { videoId: string };
export declare function parseChatPage(html: string, options?: Pick<ChatOptions, 'view' | 'maxMessages' | 'maxText'>): Omit<LiveChat, 'videoId'>;
export declare function normalizeItem(item: unknown, maxText?: number): ChatMessage | null;
export declare function parseChatResponse(json: unknown, options?: Pick<ChatOptions, 'maxMessages' | 'maxText'>): ChatPage;
export declare function findLiveChat(target: string | Target, options?: ChatOptions): Promise<LiveChat>;
export declare function fetchChat(state: { continuation: string; clientVersion?: string }, options?: ChatOptions): Promise<ChatPage>;
export declare function liveChat(target: string | Target, options?: ChatOptions & { includeBacklog?: boolean }): AsyncGenerator<{ videoId: string; messages: ChatMessage[]; deleted: string[] }, void, void>;
