import { Module } from '@nestjs/common';
import { ConfigsModule } from '../configs/configs.module.js';
import { ExecutionModule } from '../execution/execution.module.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { SuitesModule } from '../suites/suites.module.js';
import { ExperimentRunner } from './experiment-runner.service.js';
import { ExperimentsController } from './experiments.controller.js';
import { ExperimentsService } from './experiments.service.js';
import { RunsService } from './runs.service.js';

@Module({
  imports: [SuitesModule, ConfigsModule, ExecutionModule, ScoringModule],
  controllers: [ExperimentsController],
  providers: [ExperimentsService, ExperimentRunner, RunsService],
})
export class ExperimentsModule {}
