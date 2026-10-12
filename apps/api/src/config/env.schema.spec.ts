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
      JUDGE_RETRY_BASE_DELAY_MS: 2_000,
      ASSISTANT_PROVIDER: 'openrouter',
      ASSISTANT_MODEL: 'nvidia/nemotron-3-super-120b-a12b:free',
      PROVIDER_KEYS_READ_ONLY: false,
    });
  });

  it('treats blank values as unset', () => {
    expect(validateEnv({ OPENROUTER_API_KEY: '', PORT: '' })).toMatchObject({ PORT: 3000 });
    expect(validateEnv({ OPENROUTER_API_KEY: '' }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it('rejects an assistant model that is a router alias', () => {
    expect(() => validateEnv({ ASSISTANT_MODEL: 'openrouter/auto' })).toThrow(/ASSISTANT_MODEL/);
  });

  it('refuses to listen beyond this machine without a login', () => {
    expect(() => validateEnv({ HOST: '0.0.0.0' })).toThrow(/set AUTH_USERNAME and AUTH_PASSWORD/);
    expect(validateEnv({ HOST: '0.0.0.0', AUTH_USERNAME: 'u', AUTH_PASSWORD: 'p' }).HOST).toBe(
      '0.0.0.0',
    );
  });

  it('parses the read-only provider keys flag', () => {
    expect(validateEnv({}).PROVIDER_KEYS_READ_ONLY).toBe(false);
    expect(validateEnv({ PROVIDER_KEYS_READ_ONLY: 'true' }).PROVIDER_KEYS_READ_ONLY).toBe(true);
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
