export type EvictReason = 'evicted' | 'expired' | 'deleted' | 'replaced' | 'cleared';
export interface CacheOptions<V> {
  maxEntries: number;
  maxSize?: number;
  sizeOf?: (value: V, key: string) => number;
  ttlMs?: number;
  now?: () => number;
  onEvict?: (key: string, value: V, reason: EvictReason) => void;
}
export interface CacheStats { hits: number; misses: number; evictions: number; expirations: number; size: number; totalSize: number }
export interface CacheScope<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, options?: { ttlMs?: number }): void;
  getOrLoad(key: string, loader: () => V | Promise<V>, options?: { ttlMs?: number }): Promise<V>;
  has(key: string): boolean;
  delete(key: string): boolean;
}
export interface Cache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, options?: { ttlMs?: number }): Cache<V>;
  getOrLoad(key: string, loader: () => V | Promise<V>, options?: { ttlMs?: number }): Promise<V>;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  prune(): number;
  readonly size: number;
  readonly totalSize: number;
  stats(): CacheStats;
  scope(name: string): CacheScope<V>;
}
export declare function createCache<V = unknown>(options: CacheOptions<V>): Cache<V>;
