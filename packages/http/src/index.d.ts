import type { AmetherianError, EventHub } from '@foulfoxhacks/ametherian-core';
import type { DestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import type { RetryOptions } from '@foulfoxhacks/ametherian-resilience';

export declare const HTTP_STATUS: 'AMETHERIAN_HTTP_STATUS';
export declare const NETWORK: 'AMETHERIAN_NETWORK';
export declare const TOO_MANY_REDIRECTS: 'AMETHERIAN_TOO_MANY_REDIRECTS';
export declare const BASE_URL_ESCAPE: 'AMETHERIAN_BASE_URL_ESCAPE';
/** Thrown when a 307/308 redirect would have to resend a streamed (single-use) request body. */
export declare const STREAM_BODY_REDIRECT: 'AMETHERIAN_STREAM_BODY_REDIRECT';
export declare const RETRYABLE_STATUS: readonly number[];
export declare function parseRetryAfter(value: string | null | undefined, now?: () => number): number | undefined;

export declare class HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly redirected: boolean;
  readonly body: Uint8Array;
  readonly ok: boolean;
  text(): string;
  json<T = unknown>(options?: { schema?: { parse(v: unknown): T }; maxDepth?: number }): T;
}
export declare class HttpStatusError extends AmetherianError {
  readonly response: HttpResponse;
}
export declare class NetworkError extends AmetherianError {
  constructor(message: string, cause?: unknown, details?: Record<string, unknown>);
}

export interface TransportRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  /** Buffered bytes, or a single-use stream already limited to maxRequestBytes. */
  body?: Uint8Array | ReadableStream<Uint8Array>;
  signal?: AbortSignal;
  maxResponseBytes: number;
  lookup?: DestinationPolicy['lookup'];
  stream?: boolean;
}
export interface TransportResponse {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: Uint8Array | ReadableStream<Uint8Array>;
}
export type Transport = ((req: TransportRequest) => Promise<TransportResponse>) & { close?(): void };
type CA = string | Uint8Array | Array<string | Uint8Array>;
export declare function createNodeTransport(options?: {
  keepAlive?: boolean;
  lookup?: DestinationPolicy['lookup'];
  ca?: CA;
  /** http:// proxy URL; https targets are tunnelled with CONNECT. */
  proxy?: string;
  maxSocketsPerOrigin?: number;
  maxTotalSockets?: number;
  maxFreeSockets?: number;
}): Transport;
export declare function createHttp2Transport(options?: { lookup?: DestinationPolicy['lookup']; ca?: CA; idleTimeoutMs?: number }): Transport;
/**
 * Transport over a WHATWG fetch() (Cloudflare Workers, Deno, browsers, or a
 * Workers service binding). Redirects are handled by the client, never by fetch.
 * On the edge build, `ca`, `proxy` and `http2` client options throw a ConfigError.
 */
export declare function createFetchTransport(options?: { fetch?: typeof fetch }): Transport;

export declare class HttpStreamResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly redirected: boolean;
  readonly body: ReadableStream<Uint8Array>;
  readonly ok: boolean;
  bytes(): Promise<Uint8Array>;
  text(): Promise<string>;
  json<T = unknown>(options?: { schema?: { parse(v: unknown): T }; maxDepth?: number }): Promise<T>;
  cancel(reason?: unknown): Promise<void>;
}

type BufferedBody = string | Uint8Array | ArrayBuffer | URLSearchParams;
/**
 * A single-use streamed body: a web ReadableStream or any async iterable of
 * chunks (Node Readable streams included). Sent chunked unless contentLength
 * is given. Never retried; a 307/308 redirect throws STREAM_BODY_REDIRECT.
 */
type StreamBody = ReadableStream<Uint8Array | ArrayBufferView | ArrayBuffer | string> | AsyncIterable<Uint8Array | ArrayBufferView | ArrayBuffer | string>;
type Body = BufferedBody | StreamBody;
export interface RequestOptions {
  method?: string;
  url: string;
  headers?: Record<string, string> | Headers;
  body?: Body;
  json?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
  throwOnStatus?: boolean;
  retry?: false | Omit<RetryOptions, 'signal'>;
  stream?: boolean;
  maxRequestBytes?: number;
  /** Exact byte length of a streamed body; sent as content-length and enforced. Only valid with a stream body. */
  contentLength?: number;
  /** 'follow' (default), 'manual' (return the 3xx response) or 'error'. */
  redirect?: 'follow' | 'manual' | 'error';
}
export interface HttpClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  throwOnStatus?: boolean;
  policy?: DestinationPolicy;
  retry?: false | Omit<RetryOptions, 'signal'>;
  hooks?: EventHub;
  transport?: Transport;
  userAgent?: string;
  /** http:// proxy for the built-in transport. */
  proxy?: string;
  /** Use the built-in HTTP/2 transport. */
  http2?: boolean;
  /** Extra CA certificates for the built-in transports. */
  ca?: CA;
  /** Extra header names removed on cross-origin redirects (Authorization, Cookie, Proxy-Authorization always are). */
  stripHeadersOnRedirect?: string[];
  /** With baseUrl set, allow absolute URLs to other origins (default false). */
  allowAbsoluteUrls?: boolean;
  /** Refuse requests while Object.prototype is polluted (default true). */
  pollutionCheck?: boolean;
  /** Maximum request body size in bytes (default 10 MiB). */
  maxRequestBytes?: number;
  /** Pool limits for the built-in HTTP/1.1 transport. */
  maxSocketsPerOrigin?: number;
  maxTotalSockets?: number;
}
type MethodOptions = Omit<RequestOptions, 'url' | 'method' | 'stream'>;
type Method = (url: string, options?: MethodOptions) => Promise<HttpResponse>;
interface MethodWithStream {
  (url: string, options: MethodOptions & { stream: true }): Promise<HttpStreamResponse>;
  (url: string, options?: MethodOptions & { stream?: false }): Promise<HttpResponse>;
}
export interface HttpClient {
  request(options: RequestOptions & { stream: true }): Promise<HttpStreamResponse>;
  request(options: RequestOptions & { stream?: false }): Promise<HttpResponse>;
  get: MethodWithStream;
  head: Method;
  delete: MethodWithStream;
  options: Method;
  post: MethodWithStream;
  put: MethodWithStream;
  patch: MethodWithStream;
  readonly policy: DestinationPolicy;
  close(): void;
}
export declare function createHttpClient(options?: HttpClientOptions): HttpClient;

export interface AmetherianFetchInit {
  method?: string;
  /** Any WHATWG HeadersInit form. Repeated names in an array are joined with ", ". */
  headers?: Record<string, string> | Headers | ReadonlyArray<readonly [string, string]>;
  /** A ReadableStream body needs duplex: 'half', as in fetch(). */
  body?: string | ArrayBuffer | ArrayBufferView | URLSearchParams | ReadableStream<Uint8Array> | null;
  signal?: AbortSignal;
  redirect?: 'follow' | 'manual' | 'error';
  /** There is no cache; each mode adds the request headers fetch() sends for it. 'only-if-cached' throws. */
  cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache';
  /** Accepted no-ops on a server-side client (no cookie jar, document or CORS). */
  credentials?: 'omit' | 'same-origin' | 'include';
  /** 'same-origin' throws: a server-side client has no origin to enforce. */
  mode?: 'cors' | 'no-cors';
  /** Only '' or 'about:client': no Referer is sent. Set a referer header explicitly instead. */
  referrer?: '' | 'about:client';
  referrerPolicy?: string;
  /** Only '': subresource integrity is not verified, so a non-empty value throws. */
  integrity?: '';
  keepalive?: boolean;
  priority?: 'high' | 'low' | 'auto';
  duplex?: 'half';
  window?: null;
}
export type AmetherianFetch = ((input: string | URL | Request, init?: AmetherianFetchInit) => Promise<Response>) & {
  close(): void;
  readonly client: HttpClient;
};
/** WHATWG-style fetch with Ametherian defaults; rejects with typed Ametherian errors. */
export declare function createFetch(options?: HttpClientOptions): AmetherianFetch;
