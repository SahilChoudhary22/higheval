import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module.js';
import { ConfigsController } from './configs.controller.js';
import { ConfigsService } from './configs.service.js';

@Module({
  imports: [SkillsModule],
  controllers: [ConfigsController],
  providers: [ConfigsService],
  exports: [ConfigsService],
})
export class ConfigsModule {}
