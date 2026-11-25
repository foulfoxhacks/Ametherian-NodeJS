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

export interface NodeLineStatus {
  readonly major: number;
  readonly latest: string | null;
  readonly latestSecurity: string | null;
  readonly latestSecurityDate: string | null;
  readonly lts: string | null;
  readonly endOfLife: string | null;
  readonly isEndOfLife: boolean;
}
export interface NodeReleaseStatus {
  readonly lines: Readonly<Record<string, NodeLineStatus>>;
  readonly provenance: readonly Provenance[];
}
export declare function createNodeReleaseClient(options?: {
  transport?: import('@foulfoxhacks/ametherian-http').Transport;
  now?: () => number;
}): { status(majors: number[]): Promise<NodeReleaseStatus>; close(): void };
export declare function compareNodeMinimums(
  minimums: Record<string, string>,
  status: Pick<NodeReleaseStatus, 'lines'>,
): { ok: boolean; problems: readonly { major: number; kind: 'unknown-line' | 'end-of-life' | 'minimum-behind'; detail: string }[] };

export declare const KEV_URL: string;
export interface KevEntry {
  readonly cve: string;
  readonly vendor: string;
  readonly product: string;
  readonly name: string;
  readonly dateAdded: string;
  readonly dueDate: string | null;
  readonly ransomware: boolean;
  readonly cwes: readonly string[];
}
export interface KevCatalog {
  readonly version: string;
  readonly released: string;
  readonly count: number;
  readonly size: number;
  get(cve: string): KevEntry | null;
  has(cve: string): boolean;
  readonly provenance: Readonly<Provenance>;
}
export declare function createKevClient(options?: {
  transport?: import('@foulfoxhacks/ametherian-http').Transport;
  now?: () => number;
  maxResponseBytes?: number;
}): { fetchCatalog(): Promise<KevCatalog>; close(): void };
export declare function annotateWithKev<R extends { findings: readonly Finding[] }>(
  report: R,
  catalog: Pick<KevCatalog, 'get' | 'version' | 'provenance'>,
): Omit<R, 'findings'> & {
  findings: readonly (Finding & { knownExploited: (KevEntry & { catalogVersion: string; provenance: Readonly<Provenance> }) | null })[];
  knownExploited: number;
};
