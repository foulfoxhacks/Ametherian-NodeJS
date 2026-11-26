import type { Finding, KevEntry, Provenance } from './index.js';

export declare const EXIT_OK: 0;
export declare const EXIT_FINDINGS: 1;
export declare const EXIT_INCOMPLETE: 2;
export declare const USAGE: string;

export type FailOn = 'critical' | 'high' | 'moderate' | 'low' | 'any' | 'none';

export interface AuditCliIo {
  readFile(path: string): Promise<string>;
  writeFile?(path: string, text: string): Promise<void>;
  stdout(text: string): void;
  stderr(text: string): void;
  env?: Record<string, string | undefined>;
  now?: () => number;
  createOsvClient?: () => { queryBatch(packages: { ecosystem: string; name: string; version: string }[]): Promise<unknown[]>; close?(): unknown };
  createKevClient?: () => { fetchCatalog(): Promise<{ version: string; released: string; count: number; get(cve: string): KevEntry | null; provenance: Readonly<Provenance> }>; close?(): unknown };
  createNvdClient?: () => { getCve(id: string): Promise<{ id: string; cvss: { score: number; vector: string } | null } | null>; close?(): unknown };
}

export interface AuditCliFinding extends Finding {
  readonly knownExploited: (KevEntry & { catalogVersion: string; provenance: Readonly<Provenance> }) | null;
  readonly nvd: object | null;
  /** True when this finding meets the --fail-on threshold (known exploited always does, except with none). */
  readonly blocking: boolean;
}

export interface AuditCliReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly lockfile: string;
  readonly omitDev: boolean;
  readonly failOn: FailOn;
  readonly scannedPackages: number;
  readonly advisoryCount: number;
  readonly findingCount: number;
  readonly bySeverity: Readonly<Record<'critical' | 'high' | 'moderate' | 'low' | 'unknown', number>>;
  readonly knownExploitedCount: number;
  readonly staleCount: number;
  readonly blockingCount: number;
  readonly sources: readonly object[];
  readonly kev: { catalogVersion: string; released: string; count: number; retrievedAt: string } | null;
  readonly nvd: { queriedCves: number; matchedRecords: number } | null;
  readonly intelligenceErrors: readonly { source: 'KEV' | 'NVD'; id?: string; code: string }[];
  /** False when any intelligence source failed; the scan is then not clean. */
  readonly complete: boolean;
  readonly findings: readonly AuditCliFinding[];
  readonly requiresHumanReview: true;
}

/** Strip terminal escape sequences and control characters from untrusted text. */
export declare function sanitizeForTerminal(value: unknown): string;
export declare function formatReport(report: AuditCliReport): string;
export declare function exitCodeFor(report: AuditCliReport): 0 | 1 | 2;
export declare function buildAuditReport(
  options: {
    lockfile: string;
    failOn: FailOn;
    omitDev: boolean;
    advisoriesFile: string | null;
    kev: boolean;
    nvd: boolean;
    maxAgeMs: number;
  },
  io: AuditCliIo & Required<Pick<AuditCliIo, 'createOsvClient' | 'createKevClient' | 'createNvdClient'>>,
): Promise<AuditCliReport>;
/** Run `ametherian-audit` with `argv` (arguments after the program name). Resolves to the exit status. */
export declare function runAudit(argv: string[], io: AuditCliIo): Promise<0 | 1 | 2>;
