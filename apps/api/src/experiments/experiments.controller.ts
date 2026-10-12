import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import {
  comparisonSchema,
  experimentExportSchema,
  experimentInputSchema,
  experimentSchema,
  runDetailSchema,
  runSummarySchema,
  type Comparison,
  type Experiment,
  type ExperimentExport,
  type RunDetail,
  type RunSummary,
} from '@higheval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { ExperimentRunner } from './experiment-runner.service.js';
import { ExperimentsService, type ExperimentData } from './experiments.service.js';
import { renderExperimentReport } from './report.js';
import { RunsService } from './runs.service.js';

@Controller()
export class ExperimentsController {
  constructor(
    private readonly experiments: ExperimentsService,
    private readonly runner: ExperimentRunner,
    private readonly runs: RunsService,
  ) {}

  @Get('experiments')
  @ApiDoc({ summary: 'List experiments, newest first', response: z.array(experimentSchema) })
  list(): Experiment[] {
    return this.experiments.list();
  }

  @Post('experiments')
  @ApiDoc({
    summary: 'Launch an experiment',
    description:
      'Snapshots the suite and both configurations, then queues every run in a seeded random order. Refused when a configuration has no provider key or a judge model is also under test.',
    body: experimentInputSchema,
    response: experimentSchema,
  })
  create(@Body(new ZodValidationPipe(experimentInputSchema)) input: ExperimentData): Experiment {
    const experiment = this.experiments.create(input);
    this.runner.pump();
    return experiment;
  }

  @Get('experiments/:id')
  @ApiDoc({
    summary: 'Get an experiment with its progress',
    response: experimentSchema,
    params: { id: 'Experiment ID' },
  })
  get(@Param('id') id: string): Experiment {
    return this.experiments.get(id);
  }

  @Post('experiments/:id/cancel')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Cancel an experiment',
    description: 'Queued runs are cancelled and running ones are stopped.',
    response: experimentSchema,
    params: { id: 'Experiment ID' },
  })
  cancel(@Param('id') id: string): Experiment {
    this.experiments.getRow(id);
    this.runner.cancel(id);
    return this.experiments.get(id);
  }

  @Post('experiments/:id/retry-errored')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Retry the errored runs of a finished experiment',
    description:
      'Re-queues every errored run, keeping the seeded order, e.g. after a provider quota resets. Scored runs are kept. Refused while the experiment is running or when nothing errored.',
    response: experimentSchema,
    params: { id: 'Experiment ID' },
  })
  retryErrored(@Param('id') id: string): Experiment {
    const experiment = this.experiments.retryErrored(id);
    this.runner.pump();
    return experiment;
  }

  @Delete('experiments/:id')
  @HttpCode(204)
  @ApiDoc({ summary: 'Delete a finished experiment and its runs', params: { id: 'Experiment ID' } })
  remove(@Param('id') id: string): void {
    this.experiments.remove(id);
  }

  @Get('experiments/:id/runs')
  @ApiDoc({
    summary: 'List the runs of an experiment',
    response: z.array(runSummarySchema),
    params: { id: 'Experiment ID' },
  })
  listRuns(@Param('id') id: string): RunSummary[] {
    return this.experiments.listRuns(id);
  }

  @Get('experiments/:id/comparison')
  @ApiDoc({
    summary: 'Compare the two arms',
    description:
      'Paired per-task differences, a 95% bootstrap interval, a permutation p-value and the verdict.',
    response: comparisonSchema,
    params: { id: 'Experiment ID' },
  })
  comparison(@Param('id') id: string): Comparison {
    return this.experiments.comparison(id);
  }

  /** Self-contained Markdown report regenerated from stored evidence. */
  @Get('experiments/:id/report.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  @ApiDoc({
    summary: 'Experiment report as Markdown',
    produces: 'text/markdown',
    params: { id: 'Experiment ID' },
  })
  report(@Param('id') id: string): string {
    return renderExperimentReport(
      this.experiments.get(id),
      this.experiments.comparison(id),
      this.experiments.listRuns(id),
    );
  }

  /** Full evidence bundle: experiment snapshot, comparison and every run's details. */
  @Get('experiments/:id/export.json')
  @ApiDoc({
    summary: 'Full evidence bundle',
    description:
      'The experiment snapshot, its comparison and every run in full, for archiving or offline analysis.',
    response: experimentExportSchema,
    params: { id: 'Experiment ID' },
  })
  export(@Param('id') id: string): ExperimentExport {
    return {
      experiment: this.experiments.get(id),
      comparison: this.experiments.comparison(id),
      runs: this.experiments.listRuns(id).map((run) => this.runs.get(run.id)),
    };
  }

  @Get('runs/:id')
  @ApiDoc({
    summary: 'Inspect a run',
    description: 'Final output, scorer results, event timeline, workspace files, usage and errors.',
    response: runDetailSchema,
    params: { id: 'Run ID' },
  })
  getRun(@Param('id') id: string): RunDetail {
    return this.runs.get(id);
  }
}
