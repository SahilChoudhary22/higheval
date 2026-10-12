import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { OpenApiService } from '../src/openapi/openapi.service.js';

const documentSchema = z.object({
  openapi: z.literal('3.1.0'),
  info: z.object({ title: z.string(), version: z.string() }),
  paths: z.record(z.string(), z.record(z.string(), z.object({ operationId: z.string() }))),
  components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
});

/** Every `$ref` value anywhere in a JSON value. */
function refs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refs);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === '$ref' && typeof child === 'string' ? [child] : refs(child),
  );
}

describe('OpenAPI (e2e)', () => {
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(instance);
    await instance.init();
    app = instance;
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = (): App => {
    if (!app) throw new Error('App not initialized');
    return app.getHttpServer();
  };

  it('documents every route the API serves', () => {
    const routes = app?.get(OpenApiService).routes() ?? [];
    expect(routes.length).toBeGreaterThan(30);
    const undocumented = routes
      .filter((route) => !route.doc)
      .map((route) => `${route.method.toUpperCase()} ${route.path}`);
    expect(undocumented).toEqual([]);
  });

  it('serves a well-formed OpenAPI 3.1 document whose references all resolve', async () => {
    const response = await request(server()).get('/api/openapi.json').expect(200);
    const document = documentSchema.parse(response.body);
    const operations = Object.values(document.paths).flatMap((methods) => Object.values(methods));
    const ids = operations.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.paths['/api/experiments/{id}/comparison']?.get).toBeDefined();
    expect(document.paths['/api/docs']).toBeUndefined();

    const missing = refs(document)
      .map((ref) => ref.replace('#/components/schemas/', ''))
      .filter((name) => !(name in document.components.schemas));
    expect(missing).toEqual([]);
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining(['Experiment', 'SuiteInput', 'Comparison', 'ApiError']),
    );
  });

  it('documents request bodies in their input form, with defaults optional', async () => {
    const response = await request(server()).get('/api/openapi.json').expect(200);
    const { components } = documentSchema.parse(response.body);
    const input = z
      .object({ required: z.array(z.string()) })
      .parse(components.schemas.ExperimentInput);
    expect(input.required).toEqual(['name', 'suiteId', 'baselineConfigId', 'candidateConfigId']);
  });

  it('serves the interactive reference from local assets', async () => {
    const page = await request(server()).get('/api/docs').expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('/api/openapi.json');
    await request(server()).get('/api/docs/assets/swagger-ui-bundle.js').expect(200);
    await request(server()).get('/api/docs/assets/swagger-ui.css').expect(200);
  });
});
