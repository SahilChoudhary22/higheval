/** Rate-limit errors as Hermes and OpenRouter word them, e.g. "HTTP 429: Rate limit exceeded: free-models-per-min". */
const RATE_LIMITED = /\b429\b|rate.?limit/i;
/** OpenRouter's daily free-model quota: "free-models-per-day", "free-models-per-day-high-balance". */
const DAILY_QUOTA = /per-day|per day|daily/i;

/** Rate-limited retries wait this many times longer than other retryable failures. */
const RATE_LIMIT_DELAY_FACTOR = 4;
/** Each retry waits a random 80–120% of its nominal delay. */
const JITTER = 0.2;

export const DAILY_QUOTA_HINT =
  "OpenRouter's daily quota for free models is used up and resets at 00:00 UTC. Retrying sooner fails the same way: retry the errored runs after the reset, or switch to a paid model.";

export function isRateLimited(message: string): boolean {
  return RATE_LIMITED.test(message);
}

/** A quota that only resets the next day, so retrying within minutes cannot succeed. */
export function isDailyQuota(message: string): boolean {
  return isRateLimited(message) && DAILY_QUOTA.test(message);
}

/**
 * Delay before retry number `attempt` (1-based): exponential from `baseMs`.
 * Rate limits wait longer, because OpenRouter's free tier counts requests per
 * minute: with the default 15 s base, the first retry lands after about a
 * minute. Jitter keeps parallel runs from retrying in lockstep.
 */
export function retryDelayMs(
  attempt: number,
  baseMs: number,
  rateLimited: boolean,
  random: () => number = Math.random,
): number {
  const nominal = baseMs * (rateLimited ? RATE_LIMIT_DELAY_FACTOR : 1) * 2 ** (attempt - 1);
  return Math.round(nominal * (1 - JITTER + 2 * JITTER * random()));
}
