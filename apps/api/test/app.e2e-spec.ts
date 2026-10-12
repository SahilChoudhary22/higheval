import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '../src/configure-app.js';
import { healthResponseSchema } from '@higheval/shared';
import { AppModule } from '../src/app.module.js';

describe('API (e2e)', () => {
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

  it('GET /api/health returns a contract-conformant body', async () => {
    const response = await request(server()).get('/api/health').expect(200);
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('rejects requests addressed to an unexpected host (DNS rebinding)', async () => {
    await request(server()).get('/api/health').set('Host', 'attacker.example').expect(403);
  });

  it('rejects state-changing requests from another site (CSRF)', async () => {
    await request(server())
      .post('/api/skills')
      .set('Origin', 'https://attacker.example')
      .send({ name: 'csrf', description: 'x', content: 'x' })
      .expect(403);
  });

  it('does not parse HTML form posts', async () => {
    await request(server())
      .post('/api/skills')
      .type('form')
      .send({ name: 'form-post', description: 'x', content: 'x' })
      .expect(400);
  });
});
