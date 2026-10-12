import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { configureApp } from './configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.useLogger(new ConsoleLogger({ json: config.get('LOG_FORMAT', { infer: true }) === 'json' }));
  configureApp(app);

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
