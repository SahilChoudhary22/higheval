import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  providerStatusSchema,
  providerTestResultSchema,
  type ProviderId,
  type ProviderTestResult,
} from '@higheval/shared';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { ProviderKeyTester } from '../src/providers/provider-key-tester.js';

const idOf = (body: unknown): string => z.object({ id: z.string() }).parse(body).id;

/** Accepts keys containing "good", rejects "bad", and cannot reach the provider otherwise. */
class FakeKeyTester {
  readonly tested: { provider: ProviderId; key: string }[] = [];

  test(provider: ProviderId, key: string): Promise<ProviderTestResult> {
    this.tested.push({ provider, key });
    if (key.includes('good')) return Promise.resolve({ status: 'valid', message: 'Accepted.' });
    if (key.includes('bad'))
      return Promise.resolve({ status: 'rejected', message: 'Rejected (HTTP 401).' });
    return Promise.resolve({ status: 'unverified', message: 'Could not reach the provider.' });
  }
}

describe('Provider keys (e2e)', () => {
  let app: NestExpressApplication | undefined;
  const tester = new FakeKeyTester();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ProviderKeyTester)
      .useValue(tester)
      .compile();
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

  const deepseek = async () => {
    const response = await request(server()).get('/api/providers').expect(200);
    const providers = z.array(providerStatusSchema).parse(response.body);
    return providers.find((provider) => provider.id === 'deepseek');
  };

  it('lists every provider without exposing keys', async () => {
    const response = await request(server()).get('/api/providers').expect(200);
    const providers = z.array(providerStatusSchema).parse(response.body);
    expect(providers.map((provider) => provider.id)).toContain('openrouter');
    expect(await deepseek()).toMatchObject({ configured: false, source: null, keyHint: null });
  });

  it('verifies, saves and reports a key by hint only', async () => {
    const response = await request(server())
      .put('/api/providers/deepseek/key')
      .send({ apiKey: '  sk-good-key-1234  ' })
      .expect(200);
    expect(providerTestResultSchema.parse(response.body).status).toBe('valid');
    expect(tester.tested.at(-1)).toEqual({ provider: 'deepseek', key: 'sk-good-key-1234' });

    const status = await deepseek();
    expect(status).toMatchObject({ configured: true, source: 'settings', keyHint: '…1234' });
    const list = await request(server()).get('/api/providers').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('sk-good-key');
    const health = await request(server()).get('/api/health').expect(200);
    expect(health.body.checks.configuredProviders).toContain('deepseek');
  });

  it('refuses a key the provider rejects, as a field error, and keeps the old one', async () => {
    const response = await request(server())
      .put('/api/providers/deepseek/key')
      .send({ apiKey: 'sk-bad-key-9999' })
      .expect(400);
    expect(response.body.issues).toEqual([{ path: 'apiKey', message: 'Rejected (HTTP 401).' }]);
    expect((await deepseek())?.keyHint).toBe('…1234');
  });

  it('saves a key that cannot be verified, and says so', async () => {
    const response = await request(server())
      .put('/api/providers/deepseek/key')
      .send({ apiKey: 'sk-offline-5678' })
      .expect(200);
    expect(response.body.status).toBe('unverified');
    expect((await deepseek())?.keyHint).toBe('…5678');
  });

  it('tests the stored key on demand', async () => {
    const response = await request(server()).post('/api/providers/deepseek/test').expect(200);
    expect(response.body.status).toBe('unverified');
    expect(tester.tested.at(-1)?.key).toBe('sk-offline-5678');
  });

  it('removes a saved key', async () => {
    await request(server()).delete('/api/providers/deepseek/key').expect(204);
    expect(await deepseek()).toMatchObject({ configured: false, keyHint: null });
    const response = await request(server()).post('/api/providers/deepseek/test').expect(200);
    expect(response.body.status).toBe('unverified');
  });

  it('validates the provider and the key shape', async () => {
    await request(server()).get('/api/providers/nope/key').expect(404);
    await request(server())
      .put('/api/providers/nope/key')
      .send({ apiKey: 'sk-good-key' })
      .expect(400);
    await request(server())
      .put('/api/providers/deepseek/key')
      .send({ apiKey: 'short' })
      .expect(400);
    await request(server())
      .put('/api/providers/deepseek/key')
      .send({ apiKey: 'has a space-good' })
      .expect(400);
  });

  it('refuses to launch an experiment whose provider has no key', async () => {
    const suiteId = idOf(
      (
        await request(server())
          .post('/api/suites')
          .send({
            name: 'Keys',
            tasks: [
              {
                key: 'hello',
                title: 'Hello',
                prompt: 'Reply with hello.',
                scorers: [{ type: 'regex', target: { kind: 'final_output' }, pattern: 'hello' }],
              },
            ],
          })
          .expect(201)
      ).body,
    );
    const configId = async (provider: ProviderId, name: string) =>
      idOf(
        (
          await request(server())
            .post('/api/configs')
            .send({ name, model: { provider, model: 'some-model' } })
            .expect(201)
        ).body,
      );
    const baselineConfigId = await configId('openrouter', 'Has key');
    const candidateConfigId = await configId('deepseek', 'No key');
    const response = await request(server())
      .post('/api/experiments')
      .send({ name: 'No key', suiteId, baselineConfigId, candidateConfigId })
      .expect(400);
    expect(response.body.issues).toEqual([
      {
        path: 'candidateConfigId',
        message: 'No DeepSeek API key. Add one in Settings or set DEEPSEEK_API_KEY in .env.',
      },
    ]);
    const experiments = await request(server()).get('/api/experiments').expect(200);
    expect(experiments.body).toEqual([]);
  });
});
