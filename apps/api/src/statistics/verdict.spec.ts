import { decideVerdict, MIN_PAIRED_TASKS } from './verdict.js';

const base = { pairedTasks: 10, practicalMargin: 0.05, level: 0.95 };

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

  it('calls the candidate better when the interval is above zero', () => {
    const result = decideVerdict({
      ...base,
      meanDifference: 0.3,
      interval: { lower: 0.1, upper: 0.5 },
    });
    expect(result.verdict).toBe('candidate_better');
  });

  it('calls the candidate worse when the interval is below zero', () => {
    const result = decideVerdict({
      ...base,
      meanDifference: -0.3,
      interval: { lower: -0.5, upper: -0.1 },
    });
    expect(result.verdict).toBe('candidate_worse');
  });

  it('calls equivalence only when the whole interval is inside the margin', () => {
    expect(
      decideVerdict({ ...base, meanDifference: 0, interval: { lower: -0.04, upper: 0.03 } })
        .verdict,
    ).toBe('practically_equivalent');
    expect(
      decideVerdict({ ...base, meanDifference: 0, interval: { lower: -0.2, upper: 0.2 } }).verdict,
    ).toBe('inconclusive');
  });
});
