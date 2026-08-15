/**
 * Persistence helpers for the metrics module.
 *
 * Rows are upserted into the central `metrics` table (created by migration
 * 016). Counters overwrite; timings overwrite with the accumulator's running
 * totals. The `count`/`max_value` columns let callers derive mean and peak
 * per flush window without storing every sample.
 */
import { getDb } from '../../db/connection.js';
import type { MetricRow } from './collector.js';

export function persistMetrics(rows: MetricRow[]): void {
  if (rows.length === 0) return;

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO metrics (name, kind, value, count, max_value, updated_at)
     VALUES (@name, @kind, @value, @count, @maxValue, @updatedAt)
     ON CONFLICT(name) DO UPDATE SET
       value     = excluded.value,
       count     = excluded.count,
       max_value = excluded.max_value,
       updated_at = excluded.updated_at`,
  );

  const updatedAt = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const row of rows) {
      upsert.run({ ...row, updatedAt });
    }
  });
  tx();
}
