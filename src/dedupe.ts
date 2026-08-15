/**
 * In-memory inbound message deduplication.
 *
 * Channel adapters and their platforms can redeliver the same message on
 * retry, reconnect, or fan-out edge cases. The router consults this before
 * any DB work so a replayed platform message id is dropped silently instead
 * of being written to `messages_in` twice (and waking a container twice).
 *
 * Backed by a `Map` in insertion order, which gives FIFO eviction for the
 * LRU bound — good enough for a short TTL cache and zero dependencies.
 * Config comes from src/config.ts (`DEDUPE_*`) via `DedupeConfig`.
 */
import type { DedupeConfig } from './types.js';

/** id → epoch ms it was first seen. */
const seen = new Map<string, number>();

/**
 * Returns true when `id` was already observed within `cfg.ttlMs` (and is
 * therefore a duplicate). Otherwise records `id` and returns false. The
 * first-sight timestamp is preserved on hits so an id does not renew its
 * own TTL by being replayed.
 */
export function isDuplicate(id: string, cfg: DedupeConfig, now: number = Date.now()): boolean {
  if (!cfg.enabled || !id) return false;

  const firstSeenAt = seen.get(id);
  if (firstSeenAt !== undefined && now - firstSeenAt <= cfg.ttlMs) {
    return true;
  }

  // Re-record (either fresh, or expired and now eligible again). Delete
  // first so the re-insert moves the key to the back of the LRU order.
  if (firstSeenAt !== undefined) seen.delete(id);
  seen.set(id, now);

  // FIFO eviction: oldest insertion beyond the cap.
  while (seen.size > cfg.maxEntries) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }

  return false;
}

/**
 * Drop ids whose TTL has elapsed. Returns the number removed. Called
 * periodically to bound memory between real traffic bursts.
 */
export function forgetExpired(cfg: DedupeConfig, now: number = Date.now()): number {
  let removed = 0;
  for (const [id, at] of seen) {
    if (now - at > cfg.ttlMs) {
      seen.delete(id);
      removed++;
    }
  }
  return removed;
}

/** Number of ids currently tracked. Exposed for tests and telemetry. */
export function dedupeEntryCount(): number {
  return seen.size;
}

/** Clear all state. Tests and shutdown. */
export function resetDedupe(): void {
  seen.clear();
}
