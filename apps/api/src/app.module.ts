import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnv } from './config/env.schema.js';
import { REPO_ROOT } from './config/paths.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: resolve(REPO_ROOT, '.env'),
      validate: validateEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
