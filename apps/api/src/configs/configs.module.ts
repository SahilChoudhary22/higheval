import { Module } from '@nestjs/common';
import { ExecutionModule } from '../execution/execution.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { ConfigsController } from './configs.controller.js';
import { ConfigsService } from './configs.service.js';

@Module({
  imports: [SkillsModule, ExecutionModule],
  controllers: [ConfigsController],
  providers: [ConfigsService],
  exports: [ConfigsService],
})
export class ConfigsModule {}
