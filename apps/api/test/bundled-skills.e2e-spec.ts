import { Test } from '@nestjs/testing';
import { bundledSkillCatalogSchema } from '@higheval/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('Hermes built-in skills (e2e)', () => {
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

  it('GET /api/hermes/skills lists the installed Hermes built-in skills', async () => {
    const response = await request(server()).get('/api/hermes/skills').expect(200);
    expect(bundledSkillCatalogSchema.parse(response.body)).toEqual({
      status: 'available',
      hermesCommit: 'e2e0000',
      skills: [
        {
          name: 'apple-notes',
          category: 'apple',
          description: 'The apple-notes skill.',
          platforms: ['macos'],
        },
        {
          name: 'arxiv',
          category: 'research',
          description: 'The arxiv skill.',
          platforms: ['linux', 'macos', 'windows'],
        },
      ],
    });
  });
});
