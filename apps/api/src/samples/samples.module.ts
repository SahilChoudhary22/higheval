import { Module } from '@nestjs/common';
import { ConfigsModule } from '../configs/configs.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { SuitesModule } from '../suites/suites.module.js';
import { SampleSeeder } from './sample-seeder.service.js';

@Module({
  imports: [SuitesModule, SkillsModule, ConfigsModule],
  providers: [SampleSeeder],
})
export class SamplesModule {}
