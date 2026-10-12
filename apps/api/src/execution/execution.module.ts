import { Module } from '@nestjs/common';
import { AgentExecutor } from './agent-executor.js';
import { BundledSkillsService } from './hermes/bundled-skills.service.js';
import { HermesController } from './hermes/hermes.controller.js';
import { HermesExecutor } from './hermes/hermes.executor.js';

@Module({
  controllers: [HermesController],
  providers: [{ provide: AgentExecutor, useClass: HermesExecutor }, BundledSkillsService],
  exports: [AgentExecutor, BundledSkillsService],
})
export class ExecutionModule {}
