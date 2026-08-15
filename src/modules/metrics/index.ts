/**
 * Metrics module — runtime counters and delivery/timing telemetry.
 *
 * Core call sites (router, delivery) record into the in-memory collector
 * (collector.ts). This module flushes a snapshot to the central `metrics`
 * table on an interval and on shutdown, so operators can inspect traffic
 * volume and delivery latency via `ncl metrics-list`.
 *
 * Registration:
 *   - `startMetricsFlusher()` is called from src/index.ts after the central
 *     DB is initialized (so flush never races initDb).
 *   - `onShutdown` flushes a final snapshot and stops the interval.
 *   - `src/cli/resources/metrics.ts` exposes the table read-only.
 *
 * Imported for side effects by src/modules/index.ts, which also re-exports
 * the recording primitives for core call sites.
 */
import { createLogger } from '../../log.js';
import { onShutdown } from '../../response-registry.js';
import { resetMetrics, snapshot } from './collector.js';
import { persistMetrics } from './db.js';

export { incrementCounter, observeLatency, recordTiming, resetMetrics, snapshot } from './collector.js';

const log = createLogger('metrics');
const METRICS_FLUSH_MS = 30_000;

let flusher: NodeJS.Timeout | null = null;

export function startMetricsFlusher(): void {
  if (flusher) return;
  flusher = setInterval(flush, METRICS_FLUSH_MS);
  flusher.unref();
  log.debug('Metrics flusher started', { intervalMs: METRICS_FLUSH_MS });
}

export function stopMetricsFlusher(): void {
  if (!flusher) return;
  clearInterval(flusher);
  flusher = null;
  log.debug('Metrics flusher stopped');
}

export function flush(): void {
  const rows = snapshot();
  if (rows.length === 0) return;
  try {
    persistMetrics(rows);
  } catch (err) {
    log.warn('Failed to persist metrics', { err });
  }
}

onShutdown(() => {
  flush();
  stopMetricsFlusher();
  resetMetrics();
});
