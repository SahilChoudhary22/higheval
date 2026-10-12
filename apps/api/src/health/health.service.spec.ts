import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthService } from './health.service.js';

async function check(env: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    providers: [HealthService, { provide: ConfigService, useValue: new ConfigService(env) }],
  }).compile();
  return moduleRef.get(HealthService).check();
}

describe('HealthService', () => {
  let dir: string;
  let manifest: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'higheval-health-'));
    manifest = join(dir, 'manifest.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        commit: 'abc',
        repo: '/r',
        python: '/p',
        runtimeDir: '/rt',
        version: 'Hermes 1.0',
      }),
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports ok when the provider key and Hermes are both available', async () => {
    const health = await check({ OPENROUTER_API_KEY: 'k', HERMES_MANIFEST: manifest });
    expect(health).toMatchObject({
      status: 'ok',
      checks: { providerKey: true, hermesVersion: 'Hermes 1.0' },
    });
  });

  it('reports degraded and says what is missing', async () => {
    const health = await check({ HERMES_MANIFEST: join(dir, 'missing.json') });
    expect(health).toMatchObject({
      status: 'degraded',
      checks: { providerKey: false, hermesVersion: null },
    });
  });
});
