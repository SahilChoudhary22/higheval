import { z } from 'zod';
import { idSchema, timestampSchema } from './common.js';
import { configSnapshotSchema } from './configs.js';
import { scoreResultSchema } from './scoring.js';

export const ARMS = ['baseline', 'candidate'] as const;
export const armSchema = z.enum(ARMS);
export type Arm = z.infer<typeof armSchema>;

export const EXPERIMENT_STATUSES = [
  'queued',
  'running',
  'completed',
  'cancelled',
  'failed',
] as const;
export const experimentStatusSchema = z.enum(EXPERIMENT_STATUSES);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const experimentInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    suiteId: idSchema,
    baselineConfigId: idSchema,
    candidateConfigId: idSchema,
    /** Runs per task per arm. Repeats are averaged per task before comparison. */
    repetitions: z.int().min(1).max(10).default(1),
    /**
     * Smallest score difference that matters in practice. Used only to call
     * two configurations practically equivalent; never inferred from data.
     */
    practicalMargin: z.number().min(0).max(1).default(0.05),
  })
  .refine((input) => input.baselineConfigId !== input.candidateConfigId, {
    message: 'Baseline and candidate must be different configurations',
    path: ['candidateConfigId'],
  });
export type ExperimentInput = z.input<typeof experimentInputSchema>;

export const runProgressSchema = z.object({
  total: z.int().nonnegative(),
  queued: z.int().nonnegative(),
  running: z.int().nonnegative(),
  scored: z.int().nonnegative(),
  errored: z.int().nonnegative(),
  cancelled: z.int().nonnegative(),
});
export type RunProgress = z.infer<typeof runProgressSchema>;

export const experimentSchema = z.object({
  id: idSchema,
  name: z.string(),
  suiteId: idSchema,
  suiteName: z.string(),
  /** SHA-256 of the task definitions (prompts, fixtures, scorers) at launch. */
  suiteHash: z.string().length(64),
  baseline: configSnapshotSchema,
  candidate: configSnapshotSchema,
  repetitions: z.int(),
  practicalMargin: z.number(),
  seed: z.int(),
  status: experimentStatusSchema,
  progress: runProgressSchema,
  createdAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
});
export type Experiment = z.infer<typeof experimentSchema>;

export const RUN_STATUSES = ['queued', 'running', 'scored', 'errored', 'cancelled'] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Why a run that produced output stopped. Timeouts and turn limits are agent
 * failures and still get scored; they are not excluded from comparisons.
 */
export const TERMINATIONS = ['completed', 'timeout', 'max_turns'] as const;
export const terminationSchema = z.enum(TERMINATIONS);
export type Termination = z.infer<typeof terminationSchema>;

/**
 * Failures outside the agent's control (provider, environment, process, or
 * the platform's own scoring). Errored runs are excluded from comparisons and
 * reported as missing coverage, because they say nothing about agent quality.
 */
export const RUN_ERROR_KINDS = ['provider', 'setup', 'crash', 'interrupted', 'scoring'] as const;
export const runErrorKindSchema = z.enum(RUN_ERROR_KINDS);
export type RunErrorKind = z.infer<typeof runErrorKindSchema>;

export const tokenUsageSchema = z.object({
  input: z.int().nonnegative(),
  output: z.int().nonnegative(),
  cacheRead: z.int().nonnegative(),
  total: z.int().nonnegative(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const runSummarySchema = z.object({
  id: idSchema,
  experimentId: idSchema,
  arm: armSchema,
  taskId: idSchema,
  taskKey: z.string(),
  repetition: z.int().nonnegative(),
  status: runStatusSchema,
  termination: terminationSchema.nullable(),
  errorKind: runErrorKindSchema.nullable(),
  score: z.number().min(0).max(1).nullable(),
  passed: z.boolean().nullable(),
  durationMs: z.int().nonnegative().nullable(),
  tokens: tokenUsageSchema.nullable(),
  toolCalls: z.int().nonnegative(),
  /** Model API requests made by the runtime (includes retries and summaries). */
  apiCalls: z.int().nonnegative().nullable(),
  /** Provider-reported cost when available, otherwise the runtime's estimate. */
  costUsd: z.number().nonnegative().nullable(),
  /** LLM-judge requests, tokens and cost spent scoring this run (kept separate from the agent's). */
  judgeRequests: z.int().nonnegative().default(0),
  judgeTokens: z.int().nonnegative().default(0),
  judgeCostUsd: z.number().nonnegative().nullable().default(null),
  attempts: z.int().nonnegative(),
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

/** Normalized agent event, independent of the executor that produced it. */
export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session'),
    at: timestampSchema,
    model: z.string().nullable(),
    sessionId: z.string().nullable(),
  }),
  z.object({ type: z.literal('text'), at: timestampSchema, text: z.string() }),
  z.object({
    type: z.literal('tool_call'),
    at: timestampSchema,
    callId: z.string().nullable(),
    tool: z.string(),
    arguments: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_result'),
    at: timestampSchema,
    callId: z.string().nullable(),
    tool: z.string(),
    output: z.string(),
    isError: z.boolean(),
    durationMs: z.number().nonnegative().nullable(),
    /** True when the executor truncated the output before we received it. */
    truncated: z.boolean(),
  }),
  z.object({ type: z.literal('error'), at: timestampSchema, message: z.string() }),
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;

export const runDetailSchema = runSummarySchema.extend({
  taskTitle: z.string(),
  prompt: z.string(),
  configName: z.string(),
  model: z.string(),
  /** Model identity reported by the runtime, if any. */
  reportedModel: z.string().nullable(),
  finalOutput: z.string().nullable(),
  errorMessage: z.string().nullable(),
  exitCode: z.int().nullable(),
  stderrTail: z.string().nullable(),
  scores: z.array(scoreResultSchema),
  events: z.array(agentEventSchema),
  /** Files the agent left in its working directory (name and size only). */
  workspaceFiles: z.array(z.object({ path: z.string(), bytes: z.int().nonnegative() })),
});
export type RunDetail = z.infer<typeof runDetailSchema>;

export const verdictSchema = z.enum([
  'candidate_better',
  'candidate_worse',
  'practically_equivalent',
  'inconclusive',
  'insufficient_data',
]);
export type Verdict = z.infer<typeof verdictSchema>;

export const armSummarySchema = z.object({
  configName: z.string(),
  model: z.string(),
  configHash: z.string(),
  runs: z.int().nonnegative(),
  scoredRuns: z.int().nonnegative(),
  erroredRuns: z.int().nonnegative(),
  meanScore: z.number().nullable(),
  passRate: z.number().nullable(),
  meanDurationMs: z.number().nullable(),
  meanTotalTokens: z.number().nullable(),
  totalTokens: z.int().nonnegative(),
  totalApiCalls: z.int().nonnegative(),
  /** Null when no run reported a cost. */
  totalCostUsd: z.number().nonnegative().nullable(),
  /** Scoring cost from LLM judges, reported separately from the agent's own usage. */
  judgeRequests: z.int().nonnegative(),
  judgeTokens: z.int().nonnegative(),
  judgeCostUsd: z.number().nonnegative().nullable(),
});
export type ArmSummary = z.infer<typeof armSummarySchema>;

export const taskComparisonSchema = z.object({
  taskId: idSchema,
  taskKey: z.string(),
  title: z.string(),
  baselineMean: z.number().nullable(),
  candidateMean: z.number().nullable(),
  /** candidate − baseline; null when either arm has no scored run. */
  difference: z.number().nullable(),
  baselineScoredRuns: z.int().nonnegative(),
  candidateScoredRuns: z.int().nonnegative(),
});
export type TaskComparison = z.infer<typeof taskComparisonSchema>;

export const comparisonSchema = z.object({
  experimentId: idSchema,
  direction: z.literal('candidate_minus_baseline'),
  baseline: armSummarySchema,
  candidate: armSummarySchema,
  /** Tasks with at least one scored run in both arms. */
  pairedTasks: z.int().nonnegative(),
  totalTasks: z.int().nonnegative(),
  repetitions: z.int().positive(),
  meanDifference: z.number().nullable(),
  confidenceInterval: z
    .object({
      level: z.number(),
      lower: z.number(),
      upper: z.number(),
      method: z.literal('paired_bootstrap_percentile'),
      resamples: z.int().positive(),
    })
    .nullable(),
  /** Two-sided paired sign-flip permutation test on per-task differences. */
  pValue: z.number().min(0).max(1).nullable(),
  wins: z.int().nonnegative(),
  losses: z.int().nonnegative(),
  ties: z.int().nonnegative(),
  practicalMargin: z.number(),
  verdict: verdictSchema,
  verdictReason: z.string(),
  tasks: z.array(taskComparisonSchema),
});
export type Comparison = z.infer<typeof comparisonSchema>;
