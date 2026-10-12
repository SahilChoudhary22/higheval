import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('applies defaults for a minimal environment', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_FORMAT: 'pretty',
    });
  });

  it('coerces numeric strings', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => validateEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });
});
