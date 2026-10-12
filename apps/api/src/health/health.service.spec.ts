import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service.js';

async function createService(env: Record<string, unknown>): Promise<HealthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [HealthService, { provide: ConfigService, useValue: new ConfigService(env) }],
  }).compile();
  return moduleRef.get(HealthService);
}

describe('HealthService', () => {
  it('reports ok when a provider key is configured', async () => {
    const service = await createService({ OPENROUTER_API_KEY: 'test-key' });
    expect(service.check().status).toBe('ok');
  });

  it('reports degraded when no provider key is configured', async () => {
    const service = await createService({});
    expect(service.check().status).toBe('degraded');
  });
});
