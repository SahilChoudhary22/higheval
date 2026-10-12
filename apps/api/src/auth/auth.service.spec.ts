import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../config/env.schema.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { readCookie } from './session-cookie.js';

const service = (env: Record<string, unknown>) =>
  new AuthService(new ConfigService<Env, true>(validateEnv(env)));
const SIGNED_IN = {
  AUTH_USERNAME: 'reviewer',
  AUTH_PASSWORD: 'correct horse',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('AuthService', () => {
  it('is off unless both credentials are configured', () => {
    expect(service({}).enabled).toBe(false);
    expect(service({}).verifyCredentials('', '')).toBe(false);
    expect(() => service({ AUTH_USERNAME: 'reviewer' })).toThrow(
      /Set both AUTH_USERNAME and AUTH_PASSWORD/,
    );
  });

  it('accepts only the exact credentials', () => {
    const auth = service(SIGNED_IN);
    expect(auth.verifyCredentials('reviewer', 'correct horse')).toBe(true);
    expect(auth.verifyCredentials('reviewer', 'correct horse ')).toBe(false);
    expect(auth.verifyCredentials('Reviewer', 'correct horse')).toBe(false);
    expect(auth.verifyCredentials('', '')).toBe(false);
  });

  it('issues tokens that verify until they expire', () => {
    const auth = service(SIGNED_IN);
    const now = Date.parse('2026-10-12T10:00:00Z');
    const token = auth.issueToken('reviewer', now);
    expect(auth.verifyToken(token, now + 60_000)).toBe('reviewer');
    expect(auth.verifyToken(token, now + 13 * 60 * 60 * 1000)).toBeNull();
  });

  it('rejects tampered, foreign and malformed tokens', () => {
    const auth = service(SIGNED_IN);
    const token = auth.issueToken('reviewer');
    const [body = '', signature = ''] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'admin', exp: 9_999_999_999 })).toString(
      'base64url',
    );
    expect(auth.verifyToken(`${forged}.${signature}`)).toBeNull();
    expect(auth.verifyToken(`${body}.${signature}x`)).toBeNull();
    expect(service({ ...SIGNED_IN, SESSION_SECRET: 'b'.repeat(32) }).verifyToken(token)).toBeNull();
    for (const bad of [
      undefined,
      '',
      'abc',
      'a.b.c',
      `${Buffer.from('[]').toString('base64url')}.x`,
    ]) {
      expect(auth.verifyToken(bad)).toBeNull();
    }
  });
});

describe('LoginRateLimiter', () => {
  it('blocks a client after ten failures until the window ends', () => {
    const limiter = new LoginRateLimiter();
    const now = 1_000_000;
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(limiter.retryAfterMs('a', now)).toBe(0);
      limiter.recordFailure('a', now);
    }
    expect(limiter.retryAfterMs('a', now)).toBe(15 * 60 * 1000);
    expect(limiter.retryAfterMs('b', now)).toBe(0);
    expect(limiter.retryAfterMs('a', now + 15 * 60 * 1000)).toBe(0);
    limiter.reset('a');
    expect(limiter.retryAfterMs('a', now)).toBe(0);
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('theme=dark; higheval_session=abc.def; other=1', 'higheval_session')).toBe(
      'abc.def',
    );
    expect(readCookie(undefined, 'higheval_session')).toBeUndefined();
  });
});
