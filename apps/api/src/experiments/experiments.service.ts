import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, count, desc, eq } from 'drizzle-orm';
import type {
  Comparison,
  Experiment,
  experimentInputSchema,
  RunProgress,
  RunSummary,
  Task,
} from '@higheval/shared';
import { randomInt } from 'node:crypto';
import { rmSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import type { z } from 'zod';
import { newId, nowIso } from '../common/ids.js';
import { ConfigsService } from '../configs/configs.service.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { experiments, runs } from '../database/schema.js';
import { buildComparison } from '../statistics/comparison.js';
import { createRandom } from '../statistics/random.js';
import { hashTasks, SuitesService } from '../suites/suites.service.js';
import { toRunSummary } from './run-mapping.js';
import { runDir } from './run-paths.js';

export type ExperimentData = z.output<typeof experimentInputSchema>;
type ExperimentRow = typeof experiments.$inferSelect;
type NewRun = typeof runs.$inferInsert;

@Injectable()
export class ExperimentsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly suites: SuitesService,
    private readonly configs: ConfigsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Snapshots the suite and both configurations, then creates every run up
   * front in a seeded random order so both arms are interleaved over time and
   * provider-side drift does not systematically favour one arm.
   */
  create(input: ExperimentData): Experiment {
    const suite = this.suites.get(input.suiteId);
    const baseline = this.configs.snapshot(input.baselineConfigId);
    const candidate = this.configs.snapshot(input.candidateConfigId);
    assertIndependentJudges(suite.tasks, [baseline.model.model, candidate.model.model]);
    const seed = randomInt(1, 2 ** 31 - 1);
    const id = newId();

    const plan: Omit<NewRun, 'sequence'>[] = suite.tasks.flatMap((task) =>
      (['baseline', 'candidate'] as const).flatMap((arm) =>
        Array.from({ length: input.repetitions }, (_, repetition) => ({
          id: newId(),
          experimentId: id,
          arm,
          taskId: task.id,
          taskKey: task.key,
          repetition,
          status: 'queued' as const,
        })),
      ),
    );
    const ordered = shuffle(plan, createRandom(seed)).map((run, sequence) => ({
      ...run,
      sequence,
    }));

    this.db.transaction((tx) => {
      tx.insert(experiments)
        .values({
          id,
          name: input.name,
          suiteId: suite.id,
          suiteName: suite.name,
          suiteHash: hashTasks(suite.tasks),
          tasks: suite.tasks,
          baseline,
          candidate,
          repetitions: input.repetitions,
          practicalMargin: input.practicalMargin,
          seed,
          status: 'queued',
          createdAt: nowIso(),
        })
        .run();
      tx.insert(runs).values(ordered).run();
    });
    return this.get(id);
  }

  list(): Experiment[] {
    return this.db
      .select()
      .from(experiments)
      .orderBy(desc(experiments.createdAt))
      .all()
      .map((row) => this.toExperiment(row));
  }

  get(id: string): Experiment {
    return this.toExperiment(this.getRow(id));
  }

  getRow(id: string): ExperimentRow {
    const row = this.db.select().from(experiments).where(eq(experiments.id, id)).get();
    if (!row) throw new NotFoundException(`Experiment ${id} not found`);
    return row;
  }

  listRuns(id: string): RunSummary[] {
    this.getRow(id);
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.experimentId, id))
      .orderBy(asc(runs.sequence))
      .all()
      .map(toRunSummary);
  }

  comparison(id: string): Comparison {
    const experiment = this.getRow(id);
    const rows = this.db.select().from(runs).where(eq(runs.experimentId, id)).all();
    return buildComparison({
      experimentId: id,
      baseline: experiment.baseline,
      candidate: experiment.candidate,
      repetitions: experiment.repetitions,
      practicalMargin: experiment.practicalMargin,
      seed: experiment.seed,
      tasks: experiment.tasks,
      runs: rows,
    });
  }

  remove(id: string): void {
    const experiment = this.getRow(id);
    if (experiment.status === 'queued' || experiment.status === 'running') {
      throw new ConflictException('Cancel the experiment before deleting it');
    }
    const runIds = this.db
      .select({ id: runs.id, status: runs.status })
      .from(runs)
      .where(eq(runs.experimentId, id))
      .all();
    // After a cancel, agent processes take a few seconds to exit and may still write events.
    if (runIds.some((run) => run.status === 'running')) {
      throw new ConflictException('Runs are still stopping; try again in a few seconds');
    }
    this.db.delete(experiments).where(eq(experiments.id, id)).run();
    const dataDir = this.config.get('DATA_DIR', { infer: true });
    for (const run of runIds) rmSync(runDir(dataDir, run.id), { recursive: true, force: true });
  }

  private toExperiment(row: ExperimentRow): Experiment {
    const { tasks: _tasks, ...rest } = row;
    return { ...rest, progress: this.progress(row.id) };
  }

  private progress(experimentId: string): RunProgress {
    const counts = this.db
      .select({ status: runs.status, n: count() })
      .from(runs)
      .where(eq(runs.experimentId, experimentId))
      .groupBy(runs.status)
      .all();
    const progress: RunProgress = {
      total: 0,
      queued: 0,
      running: 0,
      scored: 0,
      errored: 0,
      cancelled: 0,
    };
    for (const { status, n } of counts) {
      progress[status] = n;
      progress.total += n;
    }
    return progress;
  }
}

/** Fisher–Yates shuffle driven by a seeded generator. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    const current = result[index];
    const other = result[swap];
    if (current !== undefined && other !== undefined) {
      result[index] = other;
      result[swap] = current;
    }
  }
  return result;
}

/**
 * An LLM judge grading its own output is biased toward it, so a judge model
 * may not be either of the models under test.
 */
function assertIndependentJudges(tasks: readonly Task[], modelsUnderTest: readonly string[]): void {
  for (const task of tasks) {
    for (const scorer of task.scorers) {
      if (scorer.type === 'llm_judge' && modelsUnderTest.includes(scorer.judge.model)) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: [
            {
              path: 'candidateConfigId',
              message: `Task "${task.key}" is judged by ${scorer.judge.model}, which is also a model under test. Choose a different judge or configuration.`,
            },
          ],
        });
      }
    }
  }
}
