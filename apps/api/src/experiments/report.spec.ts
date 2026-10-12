import type { Comparison, ConfigSnapshot, Experiment, RunSummary } from '@higheval/shared';
import { renderExperimentReport } from './report.js';

const config = (name: string, model: string): ConfigSnapshot => ({
  id: name,
  name,
  description: '',
  model: { provider: 'openrouter', model },
  skills: [],
  memory: { mode: 'disabled' },
  toolsets: ['file'],
  maxTurns: 10,
  timeoutSeconds: 120,
  hash: 'f'.repeat(64),
});

const arm = (name: string, model: string) => ({
  configName: name,
  model,
  configHash: 'f'.repeat(64),
  runs: 2,
  scoredRuns: 2,
  erroredRuns: 0,
  meanScore: 0.75,
  passRate: 0.5,
  meanDurationMs: 12_000,
  meanTotalTokens: 9_000,
  totalTokens: 18_000,
  totalApiCalls: 6,
  totalCostUsd: 0,
});

const experiment: Experiment = {
  id: 'exp-1',
  name: 'Lightning vs Super',
  suiteId: 's',
  suiteName: 'Agency operations',
  suiteHash: 'a'.repeat(64),
  baseline: config('Super', 'nvidia/super'),
  candidate: config('Lightning', 'nvidia/lightning'),
  repetitions: 1,
  practicalMargin: 0.05,
  seed: 7,
  status: 'completed',
  progress: { total: 2, queued: 0, running: 0, scored: 2, errored: 0, cancelled: 0 },
  createdAt: '2026-10-12T10:00:00.000Z',
  startedAt: '2026-10-12T10:00:00.000Z',
  finishedAt: '2026-10-12T10:01:30.000Z',
};

const comparison: Comparison = {
  experimentId: 'exp-1',
  direction: 'candidate_minus_baseline',
  baseline: arm('Super', 'nvidia/super'),
  candidate: arm('Lightning', 'nvidia/lightning'),
  pairedTasks: 1,
  totalTasks: 1,
  repetitions: 1,
  meanDifference: -0.25,
  confidenceInterval: {
    level: 0.95,
    lower: -0.25,
    upper: -0.25,
    method: 'paired_bootstrap_percentile',
    resamples: 10_000,
  },
  pValue: 1,
  wins: 0,
  losses: 1,
  ties: 0,
  practicalMargin: 0.05,
  verdict: 'insufficient_data',
  verdictReason: 'Only 1 task was scored under both configurations; at least 5 are needed.',
  tasks: [
    {
      taskId: 't',
      taskKey: 'overdue-invoices',
      title: 'Overdue receivables',
      baselineMean: 1,
      candidateMean: 0.75,
      difference: -0.25,
      baselineScoredRuns: 1,
      candidateScoredRuns: 1,
    },
  ],
};

const runs: RunSummary[] = (['baseline', 'candidate'] as const).map((side) => ({
  id: side,
  experimentId: 'exp-1',
  arm: side,
  taskId: 't',
  taskKey: 'overdue-invoices',
  repetition: 0,
  status: 'scored',
  termination: 'completed',
  errorKind: null,
  score: side === 'baseline' ? 1 : 0.75,
  passed: side === 'baseline',
  durationMs: 12_000,
  tokens: null,
  toolCalls: 2,
  apiCalls: 3,
  costUsd: 0,
  attempts: 1,
  startedAt: null,
  finishedAt: null,
}));

describe('renderExperimentReport', () => {
  const report = renderExperimentReport(experiment, comparison, runs);

  it('leads with the verdict and its reason', () => {
    expect(report).toContain('**Not enough data.** Only 1 task was scored');
  });

  it('records the setup needed to reproduce the experiment', () => {
    expect(report).toContain('`nvidia/lightning`');
    expect(report).toContain('seed `7`');
    expect(report).toContain(`task hash \`${'a'.repeat(16)}\``);
  });

  it('formats signed differences with a true minus sign', () => {
    expect(report).toContain(
      '| Overdue receivables (`overdue-invoices`) | 1.000 | 0.750 | −0.250 |',
    );
  });

  it('summarizes wall-clock time and retries', () => {
    expect(report).toContain('Wall-clock time 90.0 s for 2 runs.');
    expect(report).toContain('No run needed a retry.');
  });
});
