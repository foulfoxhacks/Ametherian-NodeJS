import type http from 'node:http';
import type { Transport } from '@foulfoxhacks/ametherian-http';

export interface MockCall { method: string; url: string; headers: Record<string, string>; body?: string }
export interface MockResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  json?: unknown;
}
export type MockHandler = MockResponse | Error | ((req: MockCall) => MockResponse | Error | Promise<MockResponse | Error>);
export type MockTransport = Transport & {
  readonly calls: MockCall[];
  route(key: string, handler: MockHandler): void;
};
export declare function createMockTransport(routes?: Record<string, MockHandler>): MockTransport;

export interface TestServer {
  readonly url: string;
  readonly port: number;
  readonly requests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders }>;
  readonly server: http.Server;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}
export declare function createTestServer(handler: http.RequestListener): Promise<TestServer>;

export interface FakeClock {
  now(): number;
  date(): Date;
  advance(ms: number): number;
  set(ms: number): void;
}
export declare function createFakeClock(start?: number): FakeClock;
export declare function seededRandom(seed?: number): () => number;
export declare const ADVERSARIAL_STRINGS: readonly string[];
export declare function fuzzStrings(options?: { seed?: number; count?: number; maxLength?: number }): string[];
