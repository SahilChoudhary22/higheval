import type { ConfigSnapshot } from '@higheval/shared';
import { buildComparison, type ComparisonRun } from './comparison.js';

const snapshot = (name: string, model: string): ConfigSnapshot => ({
  id: name,
  name,
  description: '',
  model: { provider: 'openrouter', model },
  skills: [],
  memory: { mode: 'disabled' },
  toolsets: ['file'],
  maxTurns: 10,
  timeoutSeconds: 120,
  hash: 'a'.repeat(64),
});

const tasks = Array.from({ length: 6 }, (_, index) => ({
  id: `t${String(index)}`,
  key: `task-${String(index)}`,
  title: `Task ${String(index)}`,
}));

function run(arm: 'baseline' | 'candidate', taskId: string, score: number): ComparisonRun {
  return {
    arm,
    taskId,
    status: 'scored',
    score,
    passed: score === 1,
    durationMs: 1000,
    tokens: null,
    apiCalls: 2,
    costUsd: 0,
  };
}

const input = (runs: ComparisonRun[]) => ({
  experimentId: 'exp',
  baseline: snapshot('Baseline', 'model-a'),
  candidate: snapshot('Candidate', 'model-b'),
  repetitions: 2,
  practicalMargin: 0.05,
  seed: 1,
  tasks,
  runs,
});

describe('buildComparison', () => {
  it('averages repetitions per task before differencing', () => {
    const runs = tasks.flatMap((task) => [
      run('baseline', task.id, 0),
      run('baseline', task.id, 1),
      run('candidate', task.id, 1),
      run('candidate', task.id, 1),
    ]);
    const comparison = buildComparison(input(runs));
    expect(comparison.pairedTasks).toBe(6);
    expect(comparison.tasks.every((task) => task.difference === 0.5)).toBe(true);
    expect(comparison.meanDifference).toBe(0.5);
    expect(comparison.verdict).toBe('candidate_better');
    expect(comparison.wins).toBe(6);
  });

  it('excludes errored runs from scores but reports them, and drops unpaired tasks', () => {
    const runs: ComparisonRun[] = [
      ...tasks
        .slice(1)
        .flatMap((task) => [run('baseline', task.id, 1), run('candidate', task.id, 1)]),
      run('baseline', 't0', 1),
      { ...run('candidate', 't0', 0), status: 'errored', score: null, passed: null },
    ];
    const comparison = buildComparison(input(runs));
    expect(comparison.pairedTasks).toBe(5);
    expect(comparison.totalTasks).toBe(6);
    expect(comparison.candidate.erroredRuns).toBe(1);
    expect(comparison.tasks[0]?.difference).toBeNull();
    expect(comparison.verdict).toBe('practically_equivalent');
    expect(comparison.ties).toBe(5);
  });

  it('reports insufficient data instead of a verdict when nothing is paired', () => {
    const comparison = buildComparison(input([]));
    expect(comparison).toMatchObject({
      pairedTasks: 0,
      meanDifference: null,
      confidenceInterval: null,
      pValue: null,
      verdict: 'insufficient_data',
    });
  });
});
