import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCredentials } from '../providers/testing.js';
import { HealthService } from './health.service.js';

function check(env: Record<string, unknown>) {
  const { config, credentials } = testCredentials(env);
  return new HealthService(config, credentials).check();
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

  it('reports ok when the provider key and Hermes are both available', () => {
    const health = check({
      OPENROUTER_API_KEY: 'test-key',
      HERMES_MANIFEST: manifest,
      MAX_CONCURRENT_RUNS: 4,
    });
    expect(health).toMatchObject({
      status: 'ok',
      checks: { configuredProviders: ['openrouter'], hermesVersion: 'Hermes 1.0' },
    });
  });

  it('reports degraded and says what is missing', () => {
    const health = check({
      HERMES_MANIFEST: join(dir, 'missing.json'),
      MAX_CONCURRENT_RUNS: 4,
    });
    expect(health).toMatchObject({
      status: 'degraded',
      checks: { configuredProviders: [], hermesVersion: null },
    });
  });
});
