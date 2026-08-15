/**
 * In-memory sliding-window rate limiter.
 *
 * Pure, side-effect-free counter keyed by an arbitrary string (the router
 * keys by `${channelType}:${platformId}`). Timestamps are stored per key
 * and expired lazily on each check, so there is no background timer — cost
 * is O(1) amortized per check and O(active keys) per prune sweep.
 *
 * Deliberately decoupled from persistence: the router enforces limits on
 * the hot path, and the (future) telemetry module observes the decisions.
 * Config comes from src/config.ts (`RATE_LIMIT_*`) via the `RateLimitConfig`
 * shape in src/types.ts.
 */
import type { RateLimitConfig } from './types.js';

export interface RateLimitDecision {
  allowed: boolean;
  /** Messages allowed right now (0 when limited). */
  remaining: number;
  /** Messages seen inside the current window. */
  current: number;
  /** Configured ceiling. */
  limit: number;
  /** Epoch ms at which the window fully drains. */
  resetAtMs: number;
}

interface Bucket {
  /** Ascending arrival timestamps still inside the window. */
  timestamps: number[];
  /** Window length captured so prune sweeps don't need the config. */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Test whether `key` may emit another message now. When allowed, records
 * the event; when denied, leaves state untouched so the caller can retry
 * after `resetAtMs` without double counting.
 */
export function checkRateLimit(key: string, cfg: RateLimitConfig, now: number = Date.now()): RateLimitDecision {
  const limit = Math.max(1, cfg.maxMessages);
  const windowMs = Math.max(1, cfg.windowMs);

  if (!cfg.enabled) {
    return { allowed: true, remaining: limit, current: 0, limit, resetAtMs: now + windowMs };
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [], windowMs };
    buckets.set(key, bucket);
  }

  const cutoff = now - bucket.windowMs;
  while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
    bucket.timestamps.shift();
  }

  const current = bucket.timestamps.length;
  if (current >= limit) {
    const resetAtMs = bucket.timestamps[0] + bucket.windowMs;
    return { allowed: false, remaining: 0, current, limit, resetAtMs };
  }

  bucket.timestamps.push(now);
  return { allowed: true, remaining: limit - current - 1, current: current + 1, limit, resetAtMs: now + windowMs };
}

/**
 * Drop expired timestamps and entirely-stale buckets. Called periodically
 * (and on shutdown) to bound memory; the router's per-check pruning keeps
 * hot keys small, this handles keys that stopped receiving traffic.
 */
export function pruneRateLimitBuckets(now: number = Date.now()): number {
  let removed = 0;
  for (const [key, bucket] of buckets) {
    const cutoff = now - bucket.windowMs;
    while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
      bucket.timestamps.shift();
    }
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Number of active (non-empty) buckets. Exposed for tests and telemetry. */
export function activeRateLimitBucketCount(): number {
  return buckets.size;
}

/** Clear all state. Tests and shutdown. */
export function resetRateLimits(): void {
  buckets.clear();
}
