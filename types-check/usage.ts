// Compile-only usage of every package's public types. Run: npm run typecheck
import {
  AmetherianError, ErrorCodes, TimeoutError, LimitExceededError, isAmetherianError,
  createDeadline, abortable, collectBytes, createByteLimitStream, redactHeaders, redactUrl,
  getRuntimeCapabilities, requireCapability, validateOptions, createResourceScope, createEventHub,
  detectPrototypePollution, assertNoPrototypePollution, checkNodeVersion, NODE_SECURITY_MINIMUMS,
  type ErrorCode,
} from '@foulfoxhacks/ametherian-core';
import { createDestinationPolicy, classifyAddress, type AddressCategory, DestinationBlockedError } from '@foulfoxhacks/ametherian-guard';
import { object, string, number, literal, array, record, union, parseJson, type Infer } from '@foulfoxhacks/ametherian-schema';
import { createCache } from '@foulfoxhacks/ametherian-cache';
import { retry, createConcurrencyLimit, createRateLimiter, createCircuitBreaker } from '@foulfoxhacks/ametherian-resilience';
import { createLogger, createMetrics, attachEventHub, publishToDiagnosticsChannel } from '@foulfoxhacks/ametherian-observability';
import { createHttpClient, createFetch, HttpStatusError, type HttpResponse } from '@foulfoxhacks/ametherian-http';
import { createMockTransport, createFakeClock, fuzzStrings } from '@foulfoxhacks/ametherian-testing';
import { normalizeOsv, auditLockfile, compareSemver, createOsvClient, createNodeReleaseClient, compareNodeMinimums } from '@foulfoxhacks/ametherian-security';
import * as ametherian from '@foulfoxhacks/ametherian';

export async function usage(): Promise<void> {
  const code: ErrorCode = ErrorCodes.TIMEOUT;
  const err: AmetherianError = new TimeoutError('t');
  const limit = new LimitExceededError('x', { limit: 1, actual: 2 });
  if (isAmetherianError(err)) err.code satisfies string;

  const deadline = createDeadline(1000);
  await abortable(Promise.resolve(1), deadline.signal);
  const bytes: Uint8Array = await collectBytes([new Uint8Array(1)], { maxBytes: 10 });
  createByteLimitStream(10);
  const safe: Record<string, string | string[] | undefined> = redactHeaders({ authorization: 'x' });
  const u: string = redactUrl('https://example.com');
  const caps = getRuntimeCapabilities();
  if (caps.fetch) requireCapability('fetch', 'webStreams');
  const opts = validateOptions({ a: 1 }, { a: { type: 'integer', min: 0 } });
  opts.a;
  await using scope = createResourceScope();
  scope.defer(() => undefined);
  const hub = createEventHub();
  const off: () => void = hub.on('x', (p) => p);
  off();

  const policy = createDestinationPolicy({ allowCategories: ['loopback'], allowPorts: [443] });
  const url: URL = policy.checkUrl('https://example.com');
  const cat: AddressCategory | null = classifyAddress('127.0.0.1');
  const blocked: DestinationBlockedError | undefined = undefined;

  const User = object({ name: string(), age: number().optional(), role: literal('a', 'b'), tags: array(string()) });
  type User = Infer<typeof User>;
  const user: User = User.parse({});
  const name: string = user.name;
  const role: 'a' | 'b' = user.role;
  const r = User.safeParse({});
  if (r.ok) r.value.tags satisfies string[];
  else r.issues[0]?.path;
  record(number(), { maxKeys: 5 }).parse({});
  union(string(), number()).parse(1) satisfies string | number;
  parseJson<User>('{}', { schema: User });

  const cache = createCache<string>({ maxEntries: 10, ttlMs: 100 });
  const v: string | undefined = cache.get('k');
  await cache.scope('t').getOrLoad('k', async () => 'v');

  await retry(async ({ attempt }) => attempt, { retries: 2 });
  await createConcurrencyLimit({ maxConcurrent: 1 }).run(() => 1);
  createRateLimiter({ capacity: 1, refillPerSecond: 1 }).tryRemove();
  const cb = createCircuitBreaker();
  cb.state satisfies 'closed' | 'open' | 'half-open';

  const logger = createLogger({ level: 'debug' });
  logger.child({ a: 1 }).info('m', { b: 2 });
  const metrics = createMetrics({ maxSeries: 10 });
  metrics.counter('c_total').inc({ a: 'b' });
  attachEventHub(hub, { logger, metrics })();
  publishToDiagnosticsChannel(hub)();

  const transport = createMockTransport({ 'GET /': { json: {} } });
  const client = createHttpClient({ policy, transport, hooks: hub, retry: false });
  const res: HttpResponse = await client.get('https://example.com/', { timeoutMs: 1000 });
  const data: User = res.json({ schema: User });
  res.headers.get('x');
  try {
    await client.post('https://example.com/', { json: { a: 1 } });
  } catch (e) {
    if (e instanceof HttpStatusError) e.response.status satisfies number;
  }
  const streamed = await client.get('https://example.com/', { stream: true });
  for await (const chunk of streamed.body) chunk satisfies Uint8Array;
  (await streamed.text()) satisfies string;
  createHttpClient({ proxy: 'http://proxy:8080', ca: 'pem', stripHeadersOnRedirect: ['x-api-key'] }).close();
  createHttpClient({ http2: true }).close();
  const fetch = createFetch({ policy });
  const fr: Response = await fetch('https://example.com/', { method: 'POST', body: 'x', redirect: 'manual' });
  (await fr.json()) satisfies unknown;
  fetch.close();
  const leaks: string[] = detectPrototypePollution();
  assertNoPrototypePollution();
  checkNodeVersion().ok satisfies boolean;
  NODE_SECURITY_MINIMUMS['22'] satisfies string | undefined;
  const nodeStatus = await createNodeReleaseClient().status([22]);
  compareNodeMinimums(NODE_SECURITY_MINIMUMS, nodeStatus).ok satisfies boolean;
  void leaks;
  createFakeClock().advance(1);
  fuzzStrings({ seed: 1 }) satisfies string[];

  const adv = normalizeOsv({}, { source: 's', retrievedAt: '2026-01-01T00:00:00Z' });
  auditLockfile('{}', [adv]).findings[0]?.requiresHumanReview satisfies true | undefined;
  compareSemver('1.0.0', '2.0.0') satisfies -1 | 0 | 1;
  const osv = createOsvClient({ transport });
  (await osv.queryPackage({ ecosystem: 'npm', name: 'x', version: '1.0.0' }))[0]?.provenance.source satisfies string | undefined;

  ametherian.http.createHttpClient satisfies typeof createHttpClient;
  void [code, limit, bytes, safe, u, url, cat, blocked, name, role, v, data];
}
