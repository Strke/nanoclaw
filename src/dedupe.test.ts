import { describe, it, expect, beforeEach } from 'vitest';

import { dedupeEntryCount, forgetExpired, isDuplicate, resetDedupe } from './dedupe.js';

const cfg = { enabled: true, maxEntries: 100, ttlMs: 60_000 };

describe('isDuplicate', () => {
  beforeEach(() => resetDedupe());

  it('passes a new id and flags a replay as duplicate', () => {
    expect(isDuplicate('msg-1', cfg, 0)).toBe(false);
    expect(isDuplicate('msg-1', cfg, 1)).toBe(true);
  });

  it('lets an id through again once the TTL has elapsed', () => {
    expect(isDuplicate('msg-1', cfg, 0)).toBe(false);
    expect(isDuplicate('msg-1', cfg, 60_001)).toBe(false);
  });

  it('does not renew the TTL on a duplicate hit', () => {
    expect(isDuplicate('msg-1', cfg, 0)).toBe(false);
    expect(isDuplicate('msg-1', cfg, 30_000)).toBe(true);
    // First-sight is still 0, so at 60_001 it has expired.
    expect(isDuplicate('msg-1', cfg, 60_001)).toBe(false);
  });

  it('is a passthrough when disabled', () => {
    const disabled = { enabled: false, maxEntries: 100, ttlMs: 60_000 };
    expect(isDuplicate('msg-1', disabled, 0)).toBe(false);
    expect(isDuplicate('msg-1', disabled, 0)).toBe(false);
  });

  it('evicts the oldest id beyond the cap', () => {
    const tiny = { enabled: true, maxEntries: 2, ttlMs: 60_000 };
    isDuplicate('a', tiny, 0);
    isDuplicate('b', tiny, 1);
    isDuplicate('c', tiny, 2); // evicts 'a'
    expect(dedupeEntryCount()).toBe(2);
    // 'a' is no longer tracked, so it passes again.
    expect(isDuplicate('a', tiny, 3)).toBe(false);
  });
});

describe('forgetExpired', () => {
  beforeEach(() => resetDedupe());

  it('removes only ids past their TTL', () => {
    isDuplicate('a', cfg, 0);
    isDuplicate('b', cfg, 50_000);
    expect(forgetExpired(cfg, 60_001)).toBe(1); // only 'a' expired
    expect(dedupeEntryCount()).toBe(1);
  });
});
