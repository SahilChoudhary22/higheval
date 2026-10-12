import type { Verdict } from '@higheval/shared';
import type { Interval } from './paired.js';

/** Below this many paired tasks we refuse to draw a conclusion. */
export const MIN_PAIRED_TASKS = 5;

export interface VerdictInput {
  pairedTasks: number;
  meanDifference: number | null;
  interval: Interval | null;
  practicalMargin: number;
  level: number;
}

/** Signed with a true minus sign, matching how the UI renders differences. */
const fmt = (value: number): string => {
  const fixed = Math.abs(value).toFixed(3);
  if (Number(fixed) === 0) return fixed;
  return `${value > 0 ? '+' : '\u2212'}${fixed}`;
};

/**
 * Decision rule, fixed before any data is seen:
 * - interval entirely above 0 → candidate better; entirely below 0 → worse;
 * - interval entirely inside ±margin → practically equivalent;
 * - otherwise inconclusive. An interval that merely spans zero is never
 *   reported as "no difference".
 */
export function decideVerdict(input: VerdictInput): { verdict: Verdict; reason: string } {
  const { pairedTasks, meanDifference, interval, practicalMargin, level } = input;
  if (pairedTasks < MIN_PAIRED_TASKS || meanDifference === null || interval === null) {
    return {
      verdict: 'insufficient_data',
      reason: `${pairedTasks === 1 ? 'Only 1 task was' : `Only ${String(pairedTasks)} tasks were`} scored under both configurations; at least ${String(MIN_PAIRED_TASKS)} are needed.`,
    };
  }
  const ci = `${String(Math.round(level * 100))}% CI [${fmt(interval.lower)}, ${fmt(interval.upper)}]`;
  const summary = `Mean difference ${fmt(meanDifference)} (${ci}) over ${String(pairedTasks)} tasks.`;
  const belowMargin =
    Math.abs(meanDifference) < practicalMargin
      ? ` The estimate is smaller than the ±${practicalMargin.toFixed(2)} practical margin.`
      : '';

  if (interval.lower > 0) {
    return {
      verdict: 'candidate_better',
      reason: `${summary} The interval excludes zero.${belowMargin}`,
    };
  }
  if (interval.upper < 0) {
    return {
      verdict: 'candidate_worse',
      reason: `${summary} The interval excludes zero.${belowMargin}`,
    };
  }
  if (interval.lower >= -practicalMargin && interval.upper <= practicalMargin) {
    return {
      verdict: 'practically_equivalent',
      reason: `${summary} The whole interval lies within the ±${practicalMargin.toFixed(2)} practical margin.`,
    };
  }
  return {
    verdict: 'inconclusive',
    reason: `${summary} The interval includes zero but also differences larger than the ±${practicalMargin.toFixed(2)} margin; more tasks or repetitions are needed.`,
  };
}
