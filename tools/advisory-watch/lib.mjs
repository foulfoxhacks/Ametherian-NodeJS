/** Shared helpers for the advisory watcher. */

/**
 * Collapse OSV records into one summary per GHSA id (OSV may list the same
 * advisory under several ids), skipping withdrawn records.
 * @param {object[]} records
 */
export function summarize(records) {
  const byGhsa = new Map();
  for (const v of records) {
    if (v.withdrawn) continue;
    const ids = [v.id, ...(v.aliases ?? [])];
    const ghsa = ids.find((x) => x.startsWith('GHSA-')) ?? v.id;
    if (byGhsa.has(ghsa)) continue;
    byGhsa.set(ghsa, {
      ghsa,
      cve: ids.filter((x) => x.startsWith('CVE-')).sort(),
      published: (v.published ?? '').slice(0, 10),
      modified: (v.modified ?? '').slice(0, 10),
      // Accepts raw OSV records and ametherian-security normalised advisories.
      severity: v.database_specific?.severity ?? (typeof v.severity === 'string' ? v.severity : 'UNKNOWN'),
      summary: String(v.summary ?? '').slice(0, 300),
    });
  }
  return [...byGhsa.values()];
}
