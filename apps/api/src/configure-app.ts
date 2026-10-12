import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createRequestGuard, LOOPBACK_HOSTS } from './common/request-guard.js';
import type { Env } from './config/env.schema.js';
import { DOCS_ASSETS_PATH } from './openapi/openapi.controller.js';

/** Swagger UI's prebuilt assets, served locally so the docs work offline. */
const SWAGGER_UI_DIR = dirname(
  createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'),
);

/** Largest accepted JSON body: comfortably above a large suite with fixtures. */
export const JSON_BODY_LIMIT = '10mb';

/**
 * HTTP setup shared by the server entry point and the e2e tests, so tests
 * exercise exactly what runs in production. The app must be created with
 * `bodyParser: false`: only JSON is parsed, so cross-site HTML form posts
 * never reach the controllers.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const allowedHosts = new Set<string>([
    ...LOOPBACK_HOSTS,
    ...config.get('ALLOWED_HOSTS', { infer: true }),
  ]);

  app.use(createRequestGuard(allowedHosts));
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useStaticAssets(SWAGGER_UI_DIR, { prefix: DOCS_ASSETS_PATH, index: false });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const host = config.get('HOST', { infer: true });
  if (!(LOOPBACK_HOSTS as readonly string[]).includes(host)) {
    Logger.warn(
      `HOST=${host} exposes the API beyond this machine. It has no authentication; put it behind an authenticating proxy.`,
      'Security',
    );
  }
}
