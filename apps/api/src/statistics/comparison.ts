import type {
  Arm,
  ArmSummary,
  Comparison,
  ConfigSnapshot,
  RunStatus,
  TaskComparison,
  TokenUsage,
} from '@higheval/shared';
import { mean, pairedBootstrapInterval, signFlipPValue } from './paired.js';
import { decideVerdict } from './verdict.js';

export const CONFIDENCE_LEVEL = 0.95;
export const BOOTSTRAP_RESAMPLES = 10_000;

/** Differences smaller than this are treated as ties. */
const TIE_EPSILON = 1e-9;

export interface ComparisonRun {
  arm: Arm;
  taskId: string;
  status: RunStatus;
  score: number | null;
  passed: boolean | null;
  durationMs: number | null;
  tokens: TokenUsage | null;
  apiCalls: number | null;
  costUsd: number | null;
  judgeRequests: number;
  judgeTokens: number;
  judgeCostUsd: number | null;
}

export interface ComparisonInput {
  experimentId: string;
  baseline: ConfigSnapshot;
  candidate: ConfigSnapshot;
  repetitions: number;
  practicalMargin: number;
  seed: number;
  tasks: readonly { id: string; key: string; title: string }[];
  runs: readonly ComparisonRun[];
}

/**
 * Builds the paired comparison. Unit of analysis is the task: repetitions are
 * averaged per task and arm, then candidate − baseline differences are taken
 * for tasks scored in both arms. Errored runs are excluded (and counted), never
 * silently treated as zero or dropped from the coverage figures.
 */
export function buildComparison(input: ComparisonInput): Comparison {
  const tasks: TaskComparison[] = input.tasks.map((task) => {
    const baseline = scoredScores(input.runs, task.id, 'baseline');
    const candidate = scoredScores(input.runs, task.id, 'candidate');
    const baselineMean = baseline.length > 0 ? mean(baseline) : null;
    const candidateMean = candidate.length > 0 ? mean(candidate) : null;
    return {
      taskId: task.id,
      taskKey: task.key,
      title: task.title,
      baselineMean,
      candidateMean,
      difference:
        baselineMean !== null && candidateMean !== null ? candidateMean - baselineMean : null,
      baselineScoredRuns: baseline.length,
      candidateScoredRuns: candidate.length,
    };
  });

  const differences = tasks.flatMap((task) => (task.difference === null ? [] : [task.difference]));
  const meanDifference = differences.length > 0 ? mean(differences) : null;
  const interval =
    differences.length > 0
      ? pairedBootstrapInterval(differences, {
          resamples: BOOTSTRAP_RESAMPLES,
          level: CONFIDENCE_LEVEL,
          seed: input.seed,
        })
      : null;
  const pValue = differences.length > 0 ? signFlipPValue(differences, { seed: input.seed }) : null;
  const { verdict, reason } = decideVerdict({
    pairedTasks: differences.length,
    meanDifference,
    interval,
    pValue,
    practicalMargin: input.practicalMargin,
    level: CONFIDENCE_LEVEL,
  });

  return {
    experimentId: input.experimentId,
    direction: 'candidate_minus_baseline',
    baseline: summarizeArm(input.baseline, input.runs, 'baseline'),
    candidate: summarizeArm(input.candidate, input.runs, 'candidate'),
    pairedTasks: differences.length,
    totalTasks: input.tasks.length,
    repetitions: input.repetitions,
    meanDifference,
    confidenceInterval: interval && {
      level: CONFIDENCE_LEVEL,
      lower: interval.lower,
      upper: interval.upper,
      method: 'paired_bootstrap_percentile',
      resamples: BOOTSTRAP_RESAMPLES,
    },
    pValue,
    wins: differences.filter((difference) => difference > TIE_EPSILON).length,
    losses: differences.filter((difference) => difference < -TIE_EPSILON).length,
    ties: differences.filter((difference) => Math.abs(difference) <= TIE_EPSILON).length,
    practicalMargin: input.practicalMargin,
    verdict,
    verdictReason: reason,
    tasks,
  };
}

function scoredScores(runs: readonly ComparisonRun[], taskId: string, arm: Arm): number[] {
  return runs.flatMap((run) =>
    run.taskId === taskId && run.arm === arm && run.status === 'scored' && run.score !== null
      ? [run.score]
      : [],
  );
}

function summarizeArm(
  snapshot: ConfigSnapshot,
  allRuns: readonly ComparisonRun[],
  arm: Arm,
): ArmSummary {
  const runs = allRuns.filter((run) => run.arm === arm);
  const scored = runs.filter((run) => run.status === 'scored' && run.score !== null);
  const durations = scored.flatMap((run) => (run.durationMs === null ? [] : [run.durationMs]));
  const tokenTotals = runs.flatMap((run) => (run.tokens === null ? [] : [run.tokens.total]));
  const costs = runs.flatMap((run) => (run.costUsd === null ? [] : [run.costUsd]));
  const judgeCosts = runs.flatMap((run) => (run.judgeCostUsd === null ? [] : [run.judgeCostUsd]));
  return {
    configName: snapshot.name,
    model: snapshot.model.model,
    configHash: snapshot.hash,
    runs: runs.length,
    scoredRuns: scored.length,
    erroredRuns: runs.filter((run) => run.status === 'errored').length,
    meanScore: scored.length > 0 ? mean(scored.map((run) => run.score ?? 0)) : null,
    passRate:
      scored.length > 0 ? scored.filter((run) => run.passed === true).length / scored.length : null,
    meanDurationMs: durations.length > 0 ? mean(durations) : null,
    meanTotalTokens: tokenTotals.length > 0 ? mean(tokenTotals) : null,
    totalTokens: tokenTotals.reduce((sum, total) => sum + total, 0),
    totalApiCalls: runs.reduce((sum, run) => sum + (run.apiCalls ?? 0), 0),
    totalCostUsd: costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) : null,
    judgeRequests: runs.reduce((sum, run) => sum + run.judgeRequests, 0),
    judgeTokens: runs.reduce((sum, run) => sum + run.judgeTokens, 0),
    judgeCostUsd: judgeCosts.length > 0 ? judgeCosts.reduce((sum, cost) => sum + cost, 0) : null,
  };
}
