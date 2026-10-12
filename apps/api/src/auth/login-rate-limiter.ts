/** Failed sign-ins allowed per client in one window. */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Slows down password guessing: after too many failed sign-ins from one
 * client, further attempts are refused until the window ends. In memory, so it
 * resets on restart; a single-instance demo needs nothing more.
 */
export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  /** Milliseconds until `client` may try again, or 0 if it may try now. */
  retryAfterMs(client: string, now = Date.now()): number {
    const entry = this.failures.get(client);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= MAX_FAILURES ? entry.resetAt - now : 0;
  }

  recordFailure(client: string, now = Date.now()): void {
    const entry = this.failures.get(client);
    if (!entry || entry.resetAt <= now)
      this.failures.set(client, { count: 1, resetAt: now + WINDOW_MS });
    else entry.count++;
  }

  reset(client: string): void {
    this.failures.delete(client);
  }
}
