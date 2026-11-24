import type { AmetherianError, EventHub } from '@foulfoxhacks/ametherian-core';
import type { DestinationPolicy } from '@foulfoxhacks/ametherian-guard';
import type { RetryOptions } from '@foulfoxhacks/ametherian-resilience';

export declare const HTTP_STATUS: 'AMETHERIAN_HTTP_STATUS';
export declare const NETWORK: 'AMETHERIAN_NETWORK';
export declare const TOO_MANY_REDIRECTS: 'AMETHERIAN_TOO_MANY_REDIRECTS';
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
  body?: Uint8Array;
  signal?: AbortSignal;
  maxResponseBytes: number;
  lookup?: DestinationPolicy['lookup'];
}
export interface TransportResponse {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: Uint8Array;
}
export type Transport = ((req: TransportRequest) => Promise<TransportResponse>) & { close?(): void };
export declare function createNodeTransport(options?: { keepAlive?: boolean; lookup?: DestinationPolicy['lookup'] }): Transport;

type Body = string | Uint8Array | ArrayBuffer | URLSearchParams;
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
}
type MethodOptions = Omit<RequestOptions, 'url' | 'method'>;
export interface HttpClient {
  request(options: RequestOptions): Promise<HttpResponse>;
  get(url: string, options?: MethodOptions): Promise<HttpResponse>;
  head(url: string, options?: MethodOptions): Promise<HttpResponse>;
  delete(url: string, options?: MethodOptions): Promise<HttpResponse>;
  options(url: string, options?: MethodOptions): Promise<HttpResponse>;
  post(url: string, options?: MethodOptions): Promise<HttpResponse>;
  put(url: string, options?: MethodOptions): Promise<HttpResponse>;
  patch(url: string, options?: MethodOptions): Promise<HttpResponse>;
  readonly policy: DestinationPolicy;
  close(): void;
}
export declare function createHttpClient(options?: HttpClientOptions): HttpClient;
