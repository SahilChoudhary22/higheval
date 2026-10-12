import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: process.env.LOG_FORMAT === 'json' }),
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const host = config.get('HOST', { infer: true });
  const port = config.get('PORT', { infer: true });
  await app.listen(port, host);
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${String(port)}`;
  Logger.log(
    config.get('NODE_ENV', { infer: true }) === 'production'
      ? `HighEval is running at ${url}`
      : `API listening on ${url}/api`,
    'Bootstrap',
  );
}

await bootstrap();
