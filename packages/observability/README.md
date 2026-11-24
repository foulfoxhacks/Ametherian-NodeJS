# @foulfoxhacks/ametherian-observability

**Status: unpublished preview.** Not released to npm, not audited, API may change.

Logging, metrics and event bridges with no third-party dependencies.

- **`createLogger`**: structured records (default sink is JSON lines on stderr).
  - Redaction is on by default for secret-looking keys (`password`, `token`, `apiKey`, `authorization`, `cookie`, `session`, …), `headers` objects and `url`/`href` fields.
  - Values are bounded: cycles, depth, long strings and binary data.
  - Sink errors never reach the caller.
  - Error *messages* are logged as-is, so don't put secrets in messages.
- **`createMetrics`**: counters, gauges and histograms.
  - Label cardinality is capped (`maxSeries`); extra label combinations fold into an `__overflow__` series.
  - Output via `snapshot()` or `toPrometheus()`.
- **`attachEventHub(hub, { logger, metrics })`**: logs and counts every event from a core `createEventHub`.
- **`publishToDiagnosticsChannel(hub, prefix)`**: forwards events to `node:diagnostics_channel` (`ametherian:<event>`) for APM tools. Publishing is skipped when nobody subscribes.
