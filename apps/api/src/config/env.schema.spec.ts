import { resolve } from 'node:path';
import { validateEnv } from './env.schema.js';
import { REPO_ROOT } from './paths.js';

describe('validateEnv', () => {
  it('applies defaults for a minimal environment', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      ALLOWED_HOSTS: [],
      PORT: 3000,
      LOG_FORMAT: 'pretty',
      DATA_DIR: resolve(REPO_ROOT, 'data'),
      HERMES_MANIFEST: resolve(REPO_ROOT, '.hermes-runtime/manifest.json'),
      MAX_CONCURRENT_RUNS: 4,
      MAX_RUN_ATTEMPTS: 3,
      RETRY_BASE_DELAY_MS: 15_000,
      SEED_SAMPLES: true,
    });
  });

  it('treats blank values as unset', () => {
    expect(validateEnv({ OPENROUTER_API_KEY: '', PORT: '' })).toMatchObject({ PORT: 3000 });
    expect(validateEnv({ OPENROUTER_API_KEY: '' }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it('parses allowed hosts as a lower-cased list', () => {
    expect(
      validateEnv({ ALLOWED_HOSTS: ' HighEval.example.com, demo.local ' }).ALLOWED_HOSTS,
    ).toEqual(['higheval.example.com', 'demo.local']);
  });

  it('coerces numeric strings', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => validateEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });
});
