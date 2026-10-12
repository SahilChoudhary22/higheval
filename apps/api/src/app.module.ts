import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEnv } from './config/env.schema.js';
import { REPO_ROOT } from './config/paths.js';
import { ConfigsModule } from './configs/configs.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExperimentsModule } from './experiments/experiments.module.js';
import { HealthModule } from './health/health.module.js';
import { OpenApiModule } from './openapi/openapi.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { SamplesModule } from './samples/samples.module.js';
import { SkillsModule } from './skills/skills.module.js';
import { SuitesModule } from './suites/suites.module.js';

const WEB_DIST = resolve(REPO_ROOT, 'apps/web/dist');

/**
 * In production the API also serves the built SPA, so the whole app runs on
 * one port from one process. In development Vite serves the UI instead.
 */
function webApp(): DynamicModule[] {
  if (process.env.NODE_ENV !== 'production' || !existsSync(resolve(WEB_DIST, 'index.html')))
    return [];
  return [ServeStaticModule.forRoot({ rootPath: WEB_DIST, exclude: ['/api/{*path}'] })];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: resolve(REPO_ROOT, '.env'),
      validate: validateEnv,
    }),
    DatabaseModule,
    ProvidersModule,
    HealthModule,
    OpenApiModule,
    SkillsModule,
    SuitesModule,
    ConfigsModule,
    ExperimentsModule,
    SamplesModule,
    ...webApp(),
  ],
})
export class AppModule {}
