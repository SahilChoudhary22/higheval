import { isDailyQuota, isRateLimited, retryDelayMs } from './rate-limits.js';

/** A random source that always lands mid-range, i.e. no jitter. */
const middle = (): number => 0.5;

describe('rate limits', () => {
  it('recognises rate-limit errors', () => {
    expect(isRateLimited('HTTP 429: Rate limit exceeded: free-models-per-min')).toBe(true);
    expect(isRateLimited('Provider is temporarily rate-limited upstream')).toBe(true);
    expect(isRateLimited('HTTP 401: invalid API key')).toBe(false);
  });

  it('tells a daily quota apart from a per-minute limit', () => {
    expect(isDailyQuota('HTTP 429: Rate limit exceeded: free-models-per-day-high-balance')).toBe(
      true,
    );
    expect(isDailyQuota('HTTP 429: Rate limit exceeded: free-models-per-day')).toBe(true);
    expect(isDailyQuota('HTTP 429: Rate limit exceeded: free-models-per-min')).toBe(false);
    // "Daily" alone is not a quota error.
    expect(isDailyQuota('HTTP 500: daily maintenance')).toBe(false);
  });

  it('backs off exponentially, and four times longer for rate limits', () => {
    expect([1, 2, 3].map((attempt) => retryDelayMs(attempt, 15_000, false, middle))).toEqual([
      15_000, 30_000, 60_000,
    ]);
    expect([1, 2, 3].map((attempt) => retryDelayMs(attempt, 15_000, true, middle))).toEqual([
      60_000, 120_000, 240_000,
    ]);
  });

  it('jitters each delay within 20% of nominal', () => {
    expect(retryDelayMs(1, 10_000, false, () => 0)).toBe(8_000);
    expect(retryDelayMs(1, 10_000, false, () => 1)).toBe(12_000);
    expect(retryDelayMs(3, 0, true, () => 1)).toBe(0);
  });
});
