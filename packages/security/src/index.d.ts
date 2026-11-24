export interface SemVer { major: number; minor: number; patch: number; pre: (string | number)[] }
export declare function parseSemver(version: string): SemVer | null;
export declare function compareSemver(a: string | SemVer, b: string | SemVer): -1 | 0 | 1;

export interface Provenance { source: string; retrievedAt: string; url?: string; confidence?: 'high' | 'medium' | 'low' }
export interface RangeEvent { introduced?: string; fixed?: string; last_affected?: string; limit?: string }
export interface Advisory {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  readonly cvss: readonly { type: string; score: string }[];
  readonly published: string | null;
  readonly modified: string;
  readonly withdrawn: string | null;
  readonly affected: readonly {
    ecosystem: string;
    name: string;
    ranges: readonly { type: 'SEMVER' | 'ECOSYSTEM'; events: RangeEvent[] }[];
    versions: readonly string[];
  }[];
  readonly references: readonly string[];
  readonly provenance: Readonly<Required<Omit<Provenance, 'url'>> & Pick<Provenance, 'url'>>;
}
export declare function normalizeOsv(raw: unknown, provenance: Provenance): Advisory;
export declare function checkAffected(
  advisory: Advisory,
  ecosystem: string,
  name: string,
  version: string,
): { affected: boolean; fixedIn?: string | null; reason?: 'withdrawn' | 'unparseable-version' };

export interface LockPackage { name: string; version: string; path: string; dev: boolean }
export declare function packagesFromLockfile(lockfile: string | object): LockPackage[];

export interface Finding {
  advisoryId: string;
  aliases: readonly string[];
  summary: string;
  severity: Advisory['severity'];
  package: string;
  version: string;
  path: string;
  dev: boolean;
  fixedIn: string | null;
  provenance: Advisory['provenance'];
  stale: boolean;
  requiresHumanReview: true;
}
export declare function auditLockfile(
  lockfile: string | object,
  advisories: Advisory[],
  options?: { now?: () => number; maxAgeMs?: number; ecosystem?: string },
): { scanned: number; advisories: number; findings: readonly Finding[]; generatedAt: string };

export declare const OSV_API: 'https://api.osv.dev';
export interface PackageQuery { ecosystem: string; name: string; version: string }
export interface OsvClient {
  queryPackage(pkg: PackageQuery): Promise<Advisory[]>;
  queryBatch(packages: PackageQuery[]): Promise<Advisory[]>;
  getVuln(id: string): Promise<Advisory>;
  close(): void;
}
export declare function createOsvClient(options?: {
  baseUrl?: string;
  client?: import('@foulfoxhacks/ametherian-http').HttpClient;
  transport?: import('@foulfoxhacks/ametherian-http').Transport;
  now?: () => number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxPages?: number;
}): OsvClient;
