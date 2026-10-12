import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  experimentInputSchema,
  type Comparison,
  type Experiment,
  type RunDetail,
  type RunSummary,
} from '@higheval/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ExperimentRunner } from './experiment-runner.service.js';
import { ExperimentsService, type ExperimentData } from './experiments.service.js';
import { RunsService } from './runs.service.js';

@Controller()
export class ExperimentsController {
  constructor(
    private readonly experiments: ExperimentsService,
    private readonly runner: ExperimentRunner,
    private readonly runs: RunsService,
  ) {}

  @Get('experiments')
  list(): Experiment[] {
    return this.experiments.list();
  }

  @Post('experiments')
  create(@Body(new ZodValidationPipe(experimentInputSchema)) input: ExperimentData): Experiment {
    const experiment = this.experiments.create(input);
    this.runner.pump();
    return experiment;
  }

  @Get('experiments/:id')
  get(@Param('id') id: string): Experiment {
    return this.experiments.get(id);
  }

  @Post('experiments/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): Experiment {
    this.experiments.getRow(id);
    this.runner.cancel(id);
    return this.experiments.get(id);
  }

  @Delete('experiments/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.experiments.remove(id);
  }

  @Get('experiments/:id/runs')
  listRuns(@Param('id') id: string): RunSummary[] {
    return this.experiments.listRuns(id);
  }

  @Get('experiments/:id/comparison')
  comparison(@Param('id') id: string): Comparison {
    return this.experiments.comparison(id);
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string): RunDetail {
    return this.runs.get(id);
  }
}
