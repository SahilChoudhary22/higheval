import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { healthResponseSchema } from '@higheval/shared';
import { AppModule } from '../src/app.module.js';

describe('API (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const instance = moduleRef.createNestApplication<INestApplication<App>>();
    instance.setGlobalPrefix('api');
    await instance.init();
    app = instance;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health returns a contract-conformant body', async () => {
    if (!app) throw new Error('App not initialized');
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });
});
