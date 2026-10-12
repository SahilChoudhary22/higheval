import type { RunSummary } from '@higheval/shared';
import type { runs } from '../database/schema.js';

type RunRow = typeof runs.$inferSelect;

export function toRunSummary(row: RunRow): RunSummary {
  return {
    id: row.id,
    experimentId: row.experimentId,
    arm: row.arm,
    taskId: row.taskId,
    taskKey: row.taskKey,
    repetition: row.repetition,
    status: row.status,
    termination: row.termination,
    errorKind: row.errorKind,
    score: row.score,
    passed: row.passed,
    durationMs: row.durationMs,
    tokens: row.tokens,
    toolCalls: row.toolCalls,
    apiCalls: row.apiCalls,
    costUsd: row.costUsd,
    judgeRequests: row.judgeRequests,
    judgeTokens: row.judgeTokens,
    judgeCostUsd: row.judgeCostUsd,
    attempts: row.attempts,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
