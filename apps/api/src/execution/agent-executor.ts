import type {
  AgentEvent,
  ConfigSnapshot,
  FixtureFile,
  RunErrorKind,
  Termination,
  TokenUsage,
} from '@higheval/shared';

/**
 * Name of the agent's working directory inside each run attempt directory.
 * Run inspection lists output files from here.
 */
export const WORKSPACE_DIRNAME = 'work';

export interface ExecutionRequest {
  runId: string;
  prompt: string;
  fixtures: readonly FixtureFile[];
  config: ConfigSnapshot;
  /** Directory owned exclusively by this run attempt; the executor may write anything inside it. */
  runDir: string;
}

export interface ExecutionHooks {
  signal: AbortSignal;
  onEvent(event: AgentEvent): void;
}

interface OutcomeBase {
  durationMs: number;
  exitCode: number | null;
  stderrTail: string | null;
  tokens: TokenUsage | null;
  reportedModel: string | null;
  sessionId: string | null;
  apiCalls: number | null;
  costUsd: number | null;
}

/** The agent ran and produced something scorable (possibly cut short). */
export interface CompletedOutcome extends OutcomeBase {
  kind: 'completed';
  termination: Termination;
  finalOutput: string | null;
  /** Agent's working directory; scorers read output files from here. */
  workspaceDir: string;
}

/** Infrastructure failure: says nothing about agent quality. */
export interface ErroredOutcome extends OutcomeBase {
  kind: 'errored';
  errorKind: RunErrorKind;
  errorMessage: string;
  /** Whether retrying the same request may succeed (e.g. rate limits). */
  retryable: boolean;
}

export interface CancelledOutcome extends OutcomeBase {
  kind: 'cancelled';
}

export type ExecutionOutcome = CompletedOutcome | ErroredOutcome | CancelledOutcome;

/**
 * Runs one task under one configuration. Implementations own process
 * management and isolation; everything downstream (scoring, storage,
 * statistics) consumes only these normalized types.
 */
export abstract class AgentExecutor {
  abstract execute(request: ExecutionRequest, hooks: ExecutionHooks): Promise<ExecutionOutcome>;
}
