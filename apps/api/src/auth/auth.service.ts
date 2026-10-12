import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.schema.js';

export const SESSION_COOKIE = 'higheval_session';
/** How long a sign-in lasts. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

interface SessionPayload {
  /** Username. */
  u: string;
  /** Expiry, in seconds since the epoch. */
  exp: number;
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Compares secrets in constant time, whatever their lengths. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Optional sign-in for hosted deployments. Credentials come from the
 * environment; sessions are stateless cookies signed with HMAC-SHA256, so
 * nothing is stored server-side and a tampered or expired cookie is rejected.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly username: string | undefined;
  private readonly password: string | undefined;
  private readonly secret: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.username = config.get('AUTH_USERNAME', { infer: true });
    this.password = config.get('AUTH_PASSWORD', { infer: true });
    const secret = config.get('SESSION_SECRET', { infer: true });
    this.secret = secret ? Buffer.from(secret) : randomBytes(32);
    if (this.enabled && !secret) {
      this.logger.warn(
        'SESSION_SECRET is not set; everyone is signed out when the server restarts',
      );
    }
  }

  get enabled(): boolean {
    return this.username !== undefined && this.password !== undefined;
  }

  /** True when the credentials match. Both are always compared, in constant time. */
  verifyCredentials(username: string, password: string): boolean {
    if (!this.enabled) return false;
    const userOk = safeEqual(username, this.username ?? '');
    const passwordOk = safeEqual(password, this.password ?? '');
    return userOk && passwordOk;
  }

  issueToken(username: string, now = Date.now()): string {
    const payload: SessionPayload = {
      u: username,
      exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  /** The signed-in username, or null for a missing, tampered or expired token. */
  verifyToken(token: string | undefined, now = Date.now()): string | null {
    if (!token) return null;
    const [body, signature, ...rest] = token.split('.');
    if (!body || !signature || rest.length > 0 || !safeEqual(signature, this.sign(body)))
      return null;
    try {
      const payload: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('u' in payload) ||
        !('exp' in payload) ||
        typeof payload.u !== 'string' ||
        typeof payload.exp !== 'number'
      ) {
        return null;
      }
      return payload.exp > now / 1000 ? payload.u : null;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
