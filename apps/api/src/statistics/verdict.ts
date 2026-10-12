import type { Verdict } from '@higheval/shared';
import type { Interval } from './paired.js';

/** Below this many paired tasks we refuse to draw a conclusion. */
export const MIN_PAIRED_TASKS = 5;

/** Two-sided significance level, matching the 95% interval. */
export const ALPHA = 0.05;

/**
 * Smallest number of paired tasks needed to claim practical equivalence.
 * "Rule of three": with no discordant task among n, the 95% upper bound on
 * the share of tasks where the arms differ is about 3/n. Task scores lie in
 * [0, 1], so differences that rare could still shift the mean by up to 3/n.
 * Equivalence is only claimed when that bound fits inside the margin.
 */
export function minTasksForEquivalence(practicalMargin: number): number {
  return practicalMargin <= 0 ? Number.POSITIVE_INFINITY : Math.ceil(3 / practicalMargin);
}

export interface VerdictInput {
  pairedTasks: number;
  meanDifference: number | null;
  interval: Interval | null;
  /** Two-sided paired sign-flip permutation p-value. */
  pValue: number | null;
  practicalMargin: number;
  level: number;
}

/** Signed with a true minus sign, matching how the UI renders differences. */
const fmt = (value: number): string => {
  const fixed = Math.abs(value).toFixed(3);
  if (Number(fixed) === 0) return fixed;
  return `${value > 0 ? '+' : '−'}${fixed}`;
};

/**
 * Decision rule, fixed before any data is seen:
 * - better / worse: the interval excludes 0 *and* the exact permutation test
 *   agrees (p ≤ α). The percentile bootstrap alone is anti-conservative when
 *   most tasks tie, so a direction is claimed only when both agree.
 * - practically equivalent: the whole interval lies within ±margin *and*
 *   there are enough tasks that unseen differences could not exceed it.
 * - otherwise inconclusive. An interval that merely spans zero is never
 *   reported as "no difference".
 */
export function decideVerdict(input: VerdictInput): { verdict: Verdict; reason: string } {
  const { pairedTasks, meanDifference, interval, pValue, practicalMargin, level } = input;
  if (
    pairedTasks < MIN_PAIRED_TASKS ||
    meanDifference === null ||
    interval === null ||
    pValue === null
  ) {
    return {
      verdict: 'insufficient_data',
      reason: `${pairedTasks === 1 ? 'Only 1 task was' : `Only ${String(pairedTasks)} tasks were`} scored under both configurations; at least ${String(MIN_PAIRED_TASKS)} are needed.`,
    };
  }
  const ci = `${String(Math.round(level * 100))}% CI [${fmt(interval.lower)}, ${fmt(interval.upper)}]`;
  const p = pValue < 0.001 ? 'p < 0.001' : `p = ${pValue.toFixed(3)}`;
  const summary = `Mean difference ${fmt(meanDifference)} (${ci}, ${p}) over ${String(pairedTasks)} tasks.`;
  const margin = `±${practicalMargin.toFixed(2)}`;
  const excludesZero = interval.lower > 0 || interval.upper < 0;

  if (excludesZero && pValue <= ALPHA) {
    const belowMargin =
      Math.abs(meanDifference) < practicalMargin
        ? ` The estimate is smaller than the ${margin} practical margin.`
        : '';
    return {
      verdict: interval.lower > 0 ? 'candidate_better' : 'candidate_worse',
      reason: `${summary} The interval excludes zero and the permutation test agrees.${belowMargin}`,
    };
  }
  if (excludesZero) {
    return {
      verdict: 'inconclusive',
      reason: `${summary} The interval excludes zero, but the exact permutation test does not confirm a difference at α = ${String(ALPHA)}, usually because only a few tasks differ. More tasks are needed.`,
    };
  }

  const insideMargin = interval.lower >= -practicalMargin && interval.upper <= practicalMargin;
  const needed = minTasksForEquivalence(practicalMargin);
  if (insideMargin && pairedTasks >= needed) {
    return {
      verdict: 'practically_equivalent',
      reason: `${summary} The whole interval lies within the ${margin} practical margin, with enough tasks (${String(needed)}+) to rule out larger hidden differences.`,
    };
  }
  if (insideMargin) {
    return {
      verdict: 'inconclusive',
      reason: `${summary} The interval lies within the ${margin} margin, but claiming equivalence needs at least ${String(needed)} paired tasks: with fewer, a regression on a handful of tasks could exceed the margin unseen.`,
    };
  }
  return {
    verdict: 'inconclusive',
    reason: `${summary} The interval includes zero but also differences larger than the ${margin} margin. More tasks are needed.`,
  };
}
