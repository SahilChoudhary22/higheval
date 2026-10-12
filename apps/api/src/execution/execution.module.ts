import { Module } from '@nestjs/common';
import { AgentExecutor } from './agent-executor.js';
import { HermesExecutor } from './hermes/hermes.executor.js';

@Module({
  providers: [{ provide: AgentExecutor, useClass: HermesExecutor }],
  exports: [AgentExecutor],
})
export class ExecutionModule {}
