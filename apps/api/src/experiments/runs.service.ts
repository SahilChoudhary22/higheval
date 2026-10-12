import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { RunDetail } from '@higheval/shared';
import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { experiments, runEvents, runs, runScores } from '../database/schema.js';
import { toRunSummary } from './run-mapping.js';
import { runWorkspaceDir } from './run-paths.js';
import { Workspace } from './workspace.js';

@Injectable()
export class RunsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get(id: string): RunDetail {
    const row = this.db
      .select({ run: runs, experiment: experiments })
      .from(runs)
      .innerJoin(experiments, eq(runs.experimentId, experiments.id))
      .where(eq(runs.id, id))
      .get();
    if (!row) throw new NotFoundException(`Run ${id} not found`);
    const { run, experiment } = row;
    const task = experiment.tasks.find((candidate) => candidate.id === run.taskId);
    const config = run.arm === 'baseline' ? experiment.baseline : experiment.candidate;

    const scores = this.db
      .select()
      .from(runScores)
      .where(eq(runScores.runId, id))
      .orderBy(asc(runScores.scorerIndex))
      .all()
      .map(({ id: _id, runId: _runId, ...score }) => score);
    const events = this.db
      .select({ event: runEvents.event })
      .from(runEvents)
      .where(eq(runEvents.runId, id))
      .orderBy(asc(runEvents.sequence))
      .all()
      .map(({ event }) => event);

    return {
      ...toRunSummary(run),
      taskTitle: task?.title ?? run.taskKey,
      prompt: task?.prompt ?? '',
      configName: config.name,
      model: config.model.model,
      reportedModel: run.reportedModel,
      finalOutput: run.finalOutput,
      errorMessage: run.errorMessage,
      exitCode: run.exitCode,
      stderrTail: run.stderrTail,
      scores,
      events,
      workspaceFiles: this.workspaceFiles(run.id, run.attempts),
    };
  }

  private workspaceFiles(runId: string, attempt: number): RunDetail['workspaceFiles'] {
    const directory = runWorkspaceDir(this.config.get('DATA_DIR', { infer: true }), runId, attempt);
    return existsSync(directory) ? new Workspace(directory).listFiles() : [];
  }
}
