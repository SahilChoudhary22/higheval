import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  configSnapshotSchema,
  type AgentEvent,
  type RunErrorKind,
  type Task,
} from '@higheval/shared';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { nowIso } from '../common/ids.js';
import type { Env } from '../config/env.schema.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { experiments, runEvents, runs, runScores } from '../database/schema.js';
import { AgentExecutor, type ExecutionOutcome } from '../execution/agent-executor.js';
import { Judge } from '../scoring/judge/judge.js';
import { scoreTask } from '../scoring/scorers.js';
import { runAttemptDir } from './run-paths.js';
import { Workspace } from './workspace.js';

type RunRow = typeof runs.$inferSelect;
type ExperimentRow = typeof experiments.$inferSelect;

const ACTIVE_EXPERIMENT_STATUSES = ['queued', 'running'] as const;

/**
 * Durable work queue. All state lives in SQLite, so a restart loses at most
 * the runs that were in flight; those are re-queued (or marked interrupted
 * once out of attempts) on boot. Concurrency is global across experiments.
 */
@Injectable()
export class ExperimentRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExperimentRunner.name);
  private readonly active = new Map<
    string,
    { experimentId: string; controller: AbortController }
  >();
  private wakeTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly executor: AgentExecutor,
    private readonly judge: Judge,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    this.recoverInterruptedRuns();
    this.pump();
  }

  onApplicationShutdown(): void {
    // In-flight runs stay `running` in the database and are recovered on next boot.
    this.stopped = true;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    for (const { controller } of this.active.values()) controller.abort();
  }

  /** Starts as many queued runs as concurrency allows. Safe to call at any time. */
  pump(): void {
    const limit = this.config.get('MAX_CONCURRENT_RUNS', { infer: true });
    while (!this.stopped && this.active.size < limit) {
      const claimed = this.claimNext();
      if (!claimed) break;
      void this.execute(claimed.run, claimed.experiment).catch((error: unknown) => {
        this.logger.error(
          `Run ${claimed.run.id} failed unexpectedly`,
          error instanceof Error ? error.stack : error,
        );
      });
    }
    this.scheduleNextRetryWake();
  }

  cancel(experimentId: string): void {
    const timestamp = nowIso();
    this.db.transaction((tx) => {
      tx.update(runs)
        .set({ status: 'cancelled', finishedAt: timestamp })
        .where(and(eq(runs.experimentId, experimentId), eq(runs.status, 'queued')))
        .run();
      tx.update(experiments)
        .set({ status: 'cancelled', finishedAt: timestamp })
        .where(
          and(
            eq(experiments.id, experimentId),
            inArray(experiments.status, ACTIVE_EXPERIMENT_STATUSES),
          ),
        )
        .run();
    });
    for (const { experimentId: owner, controller } of this.active.values()) {
      if (owner === experimentId) controller.abort();
    }
  }

  private recoverInterruptedRuns(): void {
    const maxAttempts = this.config.get('MAX_RUN_ATTEMPTS', { infer: true });
    const stranded = this.db
      .select({ run: runs, experimentStatus: experiments.status })
      .from(runs)
      .innerJoin(experiments, eq(runs.experimentId, experiments.id))
      .where(eq(runs.status, 'running'))
      .all();
    if (stranded.length === 0) return;
    const timestamp = nowIso();
    this.db.transaction((tx) => {
      for (const { run, experimentStatus } of stranded) {
        const experimentActive = (ACTIVE_EXPERIMENT_STATUSES as readonly string[]).includes(
          experimentStatus,
        );
        const update = !experimentActive
          ? { status: 'cancelled' as const, finishedAt: timestamp }
          : run.attempts < maxAttempts
            ? { status: 'queued' as const, notBefore: null }
            : {
                status: 'errored' as const,
                errorKind: 'interrupted' as const,
                errorMessage: 'The server stopped while this run was in progress.',
                finishedAt: timestamp,
              };
        tx.update(runs).set(update).where(eq(runs.id, run.id)).run();
      }
    });
    this.logger.warn(`Recovered ${String(stranded.length)} interrupted run(s)`);
    for (const experimentId of new Set(stranded.map(({ run }) => run.experimentId))) {
      this.finalizeIfDone(experimentId);
    }
  }

  /** Atomically picks the next eligible run and marks it running. */
  private claimNext(): { run: RunRow; experiment: ExperimentRow } | null {
    return this.db.transaction((tx) => {
      const timestamp = nowIso();
      const next = tx
        .select({ run: runs, experiment: experiments })
        .from(runs)
        .innerJoin(experiments, eq(runs.experimentId, experiments.id))
        .where(
          and(
            eq(runs.status, 'queued'),
            inArray(experiments.status, ACTIVE_EXPERIMENT_STATUSES),
            or(isNull(runs.notBefore), lte(runs.notBefore, timestamp)),
          ),
        )
        .orderBy(asc(experiments.createdAt), asc(runs.sequence))
        .limit(1)
        .get();
      if (!next) return null;
      const run = {
        ...next.run,
        status: 'running' as const,
        attempts: next.run.attempts + 1,
        startedAt: timestamp,
      };
      tx.update(runs)
        .set({ status: run.status, attempts: run.attempts, startedAt: timestamp, notBefore: null })
        .where(eq(runs.id, run.id))
        .run();
      if (next.experiment.status === 'queued') {
        tx.update(experiments)
          .set({ status: 'running', startedAt: timestamp })
          .where(eq(experiments.id, next.experiment.id))
          .run();
      }
      return { run, experiment: next.experiment };
    });
  }

  private async execute(run: RunRow, experiment: ExperimentRow): Promise<void> {
    try {
      const task = experiment.tasks.find((candidate) => candidate.id === run.taskId);
      if (!task) {
        this.markErrored(
          run.id,
          'setup',
          `Task ${run.taskId} is missing from the experiment snapshot.`,
        );
        return;
      }
      // Registered for the whole run, scoring included, so cancelling the
      // experiment also aborts in-flight LLM-judge calls.
      const controller = new AbortController();
      this.active.set(run.id, { experimentId: experiment.id, controller });
      try {
        const { outcome, toolCalls } = await this.runAgent(
          run,
          experiment,
          task,
          controller.signal,
        );
        if (this.stopped) return;
        await this.persistOutcome(run, task, outcome, toolCalls, controller.signal);
      } catch (error) {
        if (this.stopped) return;
        if (controller.signal.aborted) {
          this.db
            .update(runs)
            .set({ status: 'cancelled', finishedAt: nowIso() })
            .where(eq(runs.id, run.id))
            .run();
          return;
        }
        // A scorer, judge or storage failure is not agent behaviour: record it so
        // the run never stays "running" and the queue keeps moving.
        this.logger.error(
          `Could not score run ${run.id}`,
          error instanceof Error ? error.stack : error,
        );
        this.markErrored(run.id, 'scoring', `Scoring failed: ${errorMessage(error)}`);
      } finally {
        this.active.delete(run.id);
      }
    } finally {
      if (!this.stopped) {
        this.finalizeIfDone(experiment.id);
        this.pump();
      }
    }
  }

  private async runAgent(
    run: RunRow,
    experiment: ExperimentRow,
    task: Task,
    signal: AbortSignal,
  ): Promise<{ outcome: ExecutionOutcome; toolCalls: { tool: string }[] }> {
    // Parsed so snapshots stored before newer agent settings existed get those settings' defaults.
    const config = configSnapshotSchema.parse(
      run.arm === 'baseline' ? experiment.baseline : experiment.candidate,
    );

    // A retry starts from a clean slate; the attempt count records that it happened.
    this.db.delete(runEvents).where(eq(runEvents.runId, run.id)).run();
    let sequence = 0;
    let recording = true;
    const toolCalls: { tool: string }[] = [];
    const onEvent = (event: AgentEvent): void => {
      if (event.type === 'tool_call') toolCalls.push({ tool: event.tool });
      if (!recording) return;
      try {
        this.db.insert(runEvents).values({ runId: run.id, sequence: sequence++, event }).run();
      } catch (error) {
        // E.g. the run was deleted while its process was still shutting down.
        // Never let a late event throw inside a stream listener.
        recording = false;
        this.logger.warn(`Stopped recording events for run ${run.id}: ${errorMessage(error)}`);
      }
    };

    try {
      const outcome = await this.executor.execute(
        {
          runId: run.id,
          prompt: task.prompt,
          fixtures: task.fixtures,
          config,
          runDir: runAttemptDir(this.config.get('DATA_DIR', { infer: true }), run.id, run.attempts),
        },
        { signal, onEvent },
      );
      return { outcome, toolCalls };
    } catch (error) {
      return {
        toolCalls,
        outcome: {
          kind: 'errored',
          errorKind: 'crash',
          errorMessage: errorMessage(error),
          retryable: false,
          durationMs: 0,
          exitCode: null,
          stderrTail: null,
          tokens: null,
          reportedModel: null,
          sessionId: null,
          apiCalls: null,
          costUsd: null,
        },
      };
    }
  }

  private markErrored(runId: string, errorKind: RunErrorKind, message: string): void {
    this.db
      .update(runs)
      .set({ status: 'errored', errorKind, errorMessage: message, finishedAt: nowIso() })
      .where(eq(runs.id, runId))
      .run();
  }

  private async persistOutcome(
    run: RunRow,
    task: Task,
    outcome: ExecutionOutcome,
    toolCalls: readonly { tool: string }[],
    signal: AbortSignal,
  ): Promise<void> {
    const common = {
      durationMs: Math.round(outcome.durationMs),
      exitCode: outcome.exitCode,
      stderrTail: outcome.stderrTail,
      tokens: outcome.tokens,
      reportedModel: outcome.reportedModel,
      sessionId: outcome.sessionId,
      apiCalls: outcome.apiCalls,
      costUsd: outcome.costUsd,
      toolCalls: toolCalls.length,
      finishedAt: nowIso(),
    };

    if (outcome.kind === 'completed') {
      const workspace = new Workspace(outcome.workspaceDir);
      // Scores (including any network-bound LLM judges) are computed before the
      // transaction: never hold a SQLite write lock across a provider call.
      const result = await scoreTask(
        task.scorers,
        {
          taskPrompt: task.prompt,
          finalOutput: outcome.finalOutput,
          readFile: (path) => workspace.readFile(path),
          toolCalls,
        },
        task.passThreshold,
        { judge: this.judge, signal },
      );
      this.db.transaction((tx) => {
        tx.delete(runScores).where(eq(runScores.runId, run.id)).run();
        tx.insert(runScores)
          .values(result.results.map((score) => ({ ...score, runId: run.id })))
          .run();
        tx.update(runs)
          .set({
            ...common,
            status: 'scored',
            termination: outcome.termination,
            errorKind: null,
            errorMessage: null,
            finalOutput: outcome.finalOutput,
            score: result.score,
            passed: result.passed,
            judgeRequests: result.judgeUsage.requests,
            judgeTokens: result.judgeUsage.tokens,
            judgeCostUsd: result.judgeUsage.costUsd,
          })
          .where(eq(runs.id, run.id))
          .run();
      });
      return;
    }

    if (outcome.kind === 'cancelled') {
      this.db
        .update(runs)
        .set({ ...common, status: 'cancelled' })
        .where(eq(runs.id, run.id))
        .run();
      return;
    }

    const maxAttempts = this.config.get('MAX_RUN_ATTEMPTS', { infer: true });
    const experiment = this.db
      .select({ status: experiments.status })
      .from(experiments)
      .where(eq(experiments.id, run.experimentId))
      .get();
    const canRetry =
      outcome.retryable &&
      run.attempts < maxAttempts &&
      experiment !== undefined &&
      (ACTIVE_EXPERIMENT_STATUSES as readonly string[]).includes(experiment.status);
    if (canRetry) {
      const delay =
        this.config.get('RETRY_BASE_DELAY_MS', { infer: true }) * 2 ** (run.attempts - 1);
      this.logger.warn(
        `Run ${run.id} hit a retryable error; retrying in ${String(Math.round(delay / 1000))}s`,
      );
      this.db
        .update(runs)
        .set({
          ...common,
          status: 'queued',
          errorKind: outcome.errorKind,
          errorMessage: outcome.errorMessage,
          notBefore: new Date(Date.now() + delay).toISOString(),
        })
        .where(eq(runs.id, run.id))
        .run();
      return;
    }
    this.db
      .update(runs)
      .set({
        ...common,
        status: 'errored',
        errorKind: outcome.errorKind,
        errorMessage: outcome.errorMessage,
      })
      .where(eq(runs.id, run.id))
      .run();
  }

  private finalizeIfDone(experimentId: string): void {
    const pending = this.db
      .select({ n: sql<number>`count(*)` })
      .from(runs)
      .where(and(eq(runs.experimentId, experimentId), inArray(runs.status, ['queued', 'running'])))
      .get();
    if ((pending?.n ?? 0) > 0) return;
    const scored = this.db
      .select({ n: sql<number>`count(*)` })
      .from(runs)
      .where(and(eq(runs.experimentId, experimentId), eq(runs.status, 'scored')))
      .get();
    this.db
      .update(experiments)
      .set({ status: (scored?.n ?? 0) > 0 ? 'completed' : 'failed', finishedAt: nowIso() })
      .where(
        and(
          eq(experiments.id, experimentId),
          inArray(experiments.status, ACTIVE_EXPERIMENT_STATUSES),
        ),
      )
      .run();
  }

  /** Wakes the queue when the earliest backed-off retry becomes eligible. */
  private scheduleNextRetryWake(): void {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    if (this.stopped) return;
    const next = this.db
      .select({ notBefore: runs.notBefore })
      .from(runs)
      .where(and(eq(runs.status, 'queued'), sql`${runs.notBefore} is not null`))
      .orderBy(asc(runs.notBefore))
      .limit(1)
      .get();
    if (!next?.notBefore) return;
    const delay = Math.max(0, Date.parse(next.notBefore) - Date.now()) + 50;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.pump();
    }, delay);
    this.wakeTimer.unref();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
