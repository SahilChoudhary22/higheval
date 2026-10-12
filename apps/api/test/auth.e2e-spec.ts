import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { healthResponseSchema, sessionSchema } from '@higheval/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

// ConfigModule reads the environment when AppModule is imported, so this must run first.
vi.hoisted(() => {
  process.env.AUTH_USERNAME = 'highlevel';
  process.env.AUTH_PASSWORD = 'e2e-password';
  process.env.PROVIDER_KEYS_READ_ONLY = 'true';
});

describe('Sign-in (e2e)', () => {
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
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
    delete process.env.PROVIDER_KEYS_READ_ONLY;
  });

  const server = (): App => {
    if (!app) throw new Error('App not initialized');
    return app.getHttpServer();
  };

  const signIn = async (): Promise<string> => {
    const response = await request(server())
      .post('/api/auth/login')
      .send({ username: 'highlevel', password: 'e2e-password' })
      .expect(204);
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(
      /^higheval_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/,
    );
    return cookie.split(';')[0] ?? '';
  };

  it('keeps every API route closed until sign-in, except health and sign-in itself', async () => {
    for (const path of [
      '/api/suites',
      '/api/experiments',
      '/api/providers',
      '/api/openapi.json',
      '/api/docs',
    ]) {
      const response = await request(server()).get(path).expect(401);
      expect(response.body.message).toBe('Sign in required');
    }
    await request(server()).get('/api/health').expect(200);
    const session = sessionSchema.parse(
      (await request(server()).get('/api/auth/session').expect(200)).body,
    );
    expect(session).toEqual({ authRequired: true, authenticated: false, username: null });
  });

  it('signs in with the configured credentials and out again', async () => {
    const cookie = await signIn();
    await request(server()).get('/api/suites').set('Cookie', cookie).expect(200);
    const session = sessionSchema.parse(
      (await request(server()).get('/api/auth/session').set('Cookie', cookie).expect(200)).body,
    );
    expect(session).toEqual({ authRequired: true, authenticated: true, username: 'highlevel' });

    const logout = await request(server())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(logout.headers['set-cookie']?.[0]).toContain('Max-Age=0');
  });

  it('marks the cookie Secure behind an HTTPS tunnel', async () => {
    const response = await request(server())
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ username: 'highlevel', password: 'e2e-password' })
      .expect(204);
    expect(response.headers['set-cookie']?.[0]).toMatch(/; Secure$/);
  });

  it('rejects forged cookies and wrong passwords, then rate-limits the client', async () => {
    await request(server())
      .get('/api/suites')
      .set('Cookie', 'higheval_session=forged.token')
      .expect(401);
    const attempt = () =>
      request(server())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ username: 'highlevel', password: 'wrong' });
    for (let count = 0; count < 10; count++) {
      expect((await attempt()).body.message).toBe('Wrong username or password');
    }
    const limited = await attempt().expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
    // Another client is unaffected.
    await request(server())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.2')
      .send({ username: 'highlevel', password: 'e2e-password' })
      .expect(204);
  });

  it('keeps provider keys read-only when configured', async () => {
    const cookie = await signIn();
    const health = healthResponseSchema.parse(
      (await request(server()).get('/api/health').expect(200)).body,
    );
    expect(health.providerKeysEditable).toBe(false);
    await request(server())
      .put('/api/providers/deepseek/key')
      .set('Cookie', cookie)
      .send({ apiKey: 'sk-would-be-saved' })
      .expect(403);
    await request(server())
      .delete('/api/providers/openrouter/key')
      .set('Cookie', cookie)
      .expect(403);
  });
});
