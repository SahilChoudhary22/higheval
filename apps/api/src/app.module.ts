import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnv } from './config/env.schema.js';
import { REPO_ROOT } from './config/paths.js';
import { ConfigsModule } from './configs/configs.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExperimentsModule } from './experiments/experiments.module.js';
import { HealthModule } from './health/health.module.js';
import { SamplesModule } from './samples/samples.module.js';
import { SkillsModule } from './skills/skills.module.js';
import { SuitesModule } from './suites/suites.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: resolve(REPO_ROOT, '.env'),
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    SkillsModule,
    SuitesModule,
    ConfigsModule,
    ExperimentsModule,
    SamplesModule,
  ],
})
export class AppModule {}
