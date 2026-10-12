import { decideVerdict, minTasksForEquivalence, MIN_PAIRED_TASKS } from './verdict.js';

const base = { pairedTasks: 20, practicalMargin: 0.05, level: 0.95, pValue: 0.01 };

describe('decideVerdict', () => {
  it('refuses to conclude from too few tasks', () => {
    const result = decideVerdict({
      ...base,
      pairedTasks: MIN_PAIRED_TASKS - 1,
      meanDifference: 0.5,
      interval: { lower: 0.2, upper: 0.8 },
    });
    expect(result.verdict).toBe('insufficient_data');
  });

  it('calls a direction only when the interval and the permutation test agree', () => {
    expect(
      decideVerdict({ ...base, meanDifference: 0.3, interval: { lower: 0.1, upper: 0.5 } }).verdict,
    ).toBe('candidate_better');
    expect(
      decideVerdict({ ...base, meanDifference: -0.3, interval: { lower: -0.5, upper: -0.1 } })
        .verdict,
    ).toBe('candidate_worse');
  });

  it('stays inconclusive when the bootstrap excludes zero but the exact test does not', () => {
    // Five tasks all favouring the candidate: the bootstrap interval excludes 0,
    // but with n = 5 the exact sign-flip p-value can never go below 0.0625.
    const result = decideVerdict({
      ...base,
      pairedTasks: 5,
      meanDifference: 0.4,
      interval: { lower: 0.2, upper: 0.6 },
      pValue: 0.0625,
    });
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toContain('permutation test does not confirm');
  });

  it('does not call equivalence from a zero-width interval on few tasks', () => {
    // Every task tied: the bootstrap interval collapses to [0, 0].
    const result = decideVerdict({
      ...base,
      pairedTasks: 16,
      meanDifference: 0,
      interval: { lower: 0, upper: 0 },
      pValue: 1,
    });
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toContain('at least 60 paired tasks');
  });

  it('calls equivalence when the interval fits the margin and there are enough tasks', () => {
    const result = decideVerdict({
      ...base,
      pairedTasks: 60,
      meanDifference: 0,
      interval: { lower: -0.04, upper: 0.03 },
      pValue: 0.9,
    });
    expect(result.verdict).toBe('practically_equivalent');
  });

  it('is inconclusive when the interval spans zero and exceeds the margin', () => {
    expect(
      decideVerdict({
        ...base,
        meanDifference: 0,
        interval: { lower: -0.2, upper: 0.2 },
        pValue: 0.8,
      }).verdict,
    ).toBe('inconclusive');
  });
});

describe('minTasksForEquivalence', () => {
  it('follows the rule of three', () => {
    expect(minTasksForEquivalence(0.05)).toBe(60);
    expect(minTasksForEquivalence(0.1)).toBe(30);
    expect(minTasksForEquivalence(0)).toBe(Number.POSITIVE_INFINITY);
  });
});
