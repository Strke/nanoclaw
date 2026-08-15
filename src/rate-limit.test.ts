import { describe, it, expect, beforeEach } from 'vitest';

import { activeRateLimitBucketCount, checkRateLimit, pruneRateLimitBuckets, resetRateLimits } from './rate-limit.js';

const cfg = { enabled: true, maxMessages: 3, windowMs: 60_000 };

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit within the window', () => {
    expect(checkRateLimit('k', cfg, 0).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, 1).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, 2).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, 3).allowed).toBe(false);
  });

  it('reports remaining budget correctly', () => {
    const first = checkRateLimit('k', cfg, 0);
    expect(first.remaining).toBe(2);
    const second = checkRateLimit('k', cfg, 1);
    expect(second.remaining).toBe(1);
  });

  it('denies without recording once over the limit', () => {
    checkRateLimit('k', cfg, 0);
    checkRateLimit('k', cfg, 1);
    checkRateLimit('k', cfg, 2);
    expect(checkRateLimit('k', cfg, 3).allowed).toBe(false);
    // Denied checks must not push the window further out.
    expect(activeRateLimitBucketCount()).toBe(1);
  });

  it('is a no-op passthrough when disabled', () => {
    const d = checkRateLimit('k', { enabled: false, maxMessages: 1, windowMs: 60_000 }, 0);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(1);
  });

  it('expires timestamps outside the window (sliding)', () => {
    expect(checkRateLimit('k', cfg, 0).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, 1).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, 2).allowed).toBe(true);
    // Window slides: at t=60_001 the t=0 event is expired, one slot opens.
    expect(checkRateLimit('k', cfg, 60_001).allowed).toBe(true);
  });

  it('tracks each key independently', () => {
    expect(checkRateLimit('a', cfg, 0).allowed).toBe(true);
    expect(checkRateLimit('b', cfg, 0).allowed).toBe(true);
    expect(activeRateLimitBucketCount()).toBe(2);
  });
});

describe('pruneRateLimitBuckets', () => {
  beforeEach(() => resetRateLimits());

  it('removes buckets whose window has fully drained', () => {
    checkRateLimit('k', cfg, 0);
    expect(activeRateLimitBucketCount()).toBe(1);
    expect(pruneRateLimitBuckets(61_000)).toBe(1);
    expect(activeRateLimitBucketCount()).toBe(0);
  });

  it('keeps buckets with live timestamps', () => {
    checkRateLimit('k', cfg, 50_000);
    expect(pruneRateLimitBuckets(60_000)).toBe(0);
    expect(activeRateLimitBucketCount()).toBe(1);
  });
});
