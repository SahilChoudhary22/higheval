import { DAILY_QUOTA_HINT, isDailyQuota } from '../../providers/rate-limits.js';
import type { HermesResult } from './hermes-stream-parser.js';

export type Classification =
  | { kind: 'completed' }
  /** The agent stopped without finishing its turn (e.g. turn limit); still scorable. */
  | { kind: 'incomplete' }
  | { kind: 'provider'; retryable: boolean; message: string }
  | { kind: 'crash'; message: string };

const RETRYABLE_PROVIDER =
  /\b(429|5\d\d)\b|rate.?limit|overloaded|temporarily unavailable|timed? ?out|ECONNRESET|ENOTFOUND|EAI_AGAIN/i;
const FATAL_PROVIDER =
  /\b(401|402|403|404)\b|api key|unauthori[sz]ed|credits|not a valid model|no endpoints|credentials or agent init failed/i;

/**
 * Maps a Hermes exit into our outcome taxonomy. Hermes exits 1 *without* an
 * error field when the agent stops early (turn limit), and 1 *with* an error
 * for provider failures. A missing terminal event means the process crashed.
 */
export function classifyHermesExit(
  result: HermesResult | null,
  stderrTail: string,
): Classification {
  if (!result) {
    const lastLine = stderrTail.trim().split('\n').at(-1) ?? '';
    return {
      kind: 'crash',
      message: `Hermes exited without a result event${lastLine ? `: ${lastLine}` : ''}`,
    };
  }
  if (!result.error) return result.exitCode === 0 ? { kind: 'completed' } : { kind: 'incomplete' };
  const message = result.error;
  if (isDailyQuota(message)) {
    return { kind: 'provider', retryable: false, message: `${message}. ${DAILY_QUOTA_HINT}` };
  }
  if (FATAL_PROVIDER.test(message)) return { kind: 'provider', retryable: false, message };
  if (RETRYABLE_PROVIDER.test(message)) return { kind: 'provider', retryable: true, message };
  return { kind: 'crash', message };
}
