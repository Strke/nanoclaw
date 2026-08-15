/**
 * In-memory metrics collector.
 *
 * A tiny counters + timings registry with no dependencies. Core (router,
 * delivery) and modules call `incrementCounter` / `recordTiming` on the hot
 * path; the metrics module flushes a snapshot to the central `metrics` table
 * on an interval so values survive a restart and are queryable via `ncl`.
 *
 * Deliberately lossy-in-memory: the source of truth is the flushed DB rows,
 * and `resetMetrics()` only affects the in-memory accumulator (tests).
 */

export type MetricKind = 'counter' | 'timing';

/** Normalized row, ready for persistence. */
export interface MetricRow {
  name: string;
  kind: MetricKind;
  /** Counter value, or total ms for timings. */
  value: number;
  /** 1 for counters; sample count for timings. */
  count: number;
  /** 0 for counters; largest sample (ms) for timings. */
  maxValue: number;
}

const counters = new Map<string, number>();

interface TimingAccumulator {
  count: number;
  totalMs: number;
  maxMs: number;
}
const timings = new Map<string, TimingAccumulator>();

export function incrementCounter(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function recordTiming(name: string, ms: number): void {
  const clamped = Math.max(0, ms);
  const prev = timings.get(name);
  if (!prev) {
    timings.set(name, { count: 1, totalMs: clamped, maxMs: clamped });
    return;
  }
  prev.count += 1;
  prev.totalMs += clamped;
  if (clamped > prev.maxMs) prev.maxMs = clamped;
}

/**
 * Record a duration from an earlier epoch-ms (or monotonic start) captured
 * with `startTimer()` / `Date.now()`. No-op wrapper over `recordTiming`.
 */
export function observeLatency(name: string, startMs: number): void {
  recordTiming(name, Date.now() - startMs);
}

/** Materialize a snapshot of the current accumulator state. */
export function snapshot(): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const [name, value] of counters) {
    rows.push({ name, kind: 'counter', value, count: 1, maxValue: 0 });
  }
  for (const [name, t] of timings) {
    rows.push({ name, kind: 'timing', value: t.totalMs, count: t.count, maxValue: t.maxMs });
  }
  return rows;
}

/** Clear the in-memory accumulator. Tests and shutdown. */
export function resetMetrics(): void {
  counters.clear();
  timings.clear();
}
