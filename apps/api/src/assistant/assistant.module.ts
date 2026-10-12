import { Module } from '@nestjs/common';
import { ExecutionModule } from '../execution/execution.module.js';
import { SuiteAssistantController } from './suite-assistant.controller.js';
import { SuiteAssistantService } from './suite-assistant.service.js';

@Module({
  imports: [ExecutionModule],
  controllers: [SuiteAssistantController],
  providers: [SuiteAssistantService],
})
export class AssistantModule {}
