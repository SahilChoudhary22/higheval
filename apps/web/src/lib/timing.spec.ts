import { describe, expect, it } from 'vitest';
import { estimateDurationMs, estimateRemainingMs, formatApproxDuration } from './timing';

const progress = (finished: number, total = 20) => ({
  total,
  queued: total - finished,
  running: 0,
  scored: finished,
  errored: 0,
  cancelled: 0,
});

describe('timing', () => {
  it('estimates an experiment in batches of concurrent runs', () => {
    expect(estimateDurationMs(10, 4)).toBe(3 * 40_000);
    expect(estimateDurationMs(96, 4)).toBe(24 * 40_000);
  });

  it('extrapolates remaining time from the pace so far', () => {
    const start = '2026-10-12T10:00:00.000Z';
    const now = Date.parse('2026-10-12T10:05:00.000Z');
    expect(estimateRemainingMs(progress(5), start, now)).toBe(15 * 60_000);
  });

  it('declines to estimate before any run finishes', () => {
    expect(estimateRemainingMs(progress(0), '2026-10-12T10:00:00.000Z')).toBeNull();
    expect(estimateRemainingMs(progress(3), null)).toBeNull();
  });

  it('formats approximate durations', () => {
    expect(formatApproxDuration(20_000)).toBe('under a minute');
    expect(formatApproxDuration(3 * 60_000)).toBe('about 3 min');
    expect(formatApproxDuration(80 * 60_000)).toBe('about 1 h 20 min');
  });
});
