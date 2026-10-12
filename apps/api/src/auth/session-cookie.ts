import type { Request } from 'express';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './auth.service.js';

/** The value of one cookie from a Cookie header, if present. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export const sessionToken = (request: Request): string | undefined =>
  readCookie(request.headers.cookie, SESSION_COOKIE);

/**
 * Behind an HTTPS tunnel the app itself speaks HTTP, so the original scheme
 * comes from X-Forwarded-Proto. It only decides the Secure flag.
 */
const isHttps = (request: Request): boolean =>
  request.secure || request.headers['x-forwarded-proto'] === 'https';

/**
 * HttpOnly keeps scripts from reading the session; SameSite=Lax keeps other
 * sites' requests from carrying it (the request guard also rejects cross-site
 * writes); Secure whenever the visitor is on HTTPS.
 */
export function sessionCookie(request: Request, token: string | null): string {
  const attributes = [
    `${SESSION_COOKIE}=${token ?? ''}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${String(token ? SESSION_TTL_SECONDS : 0)}`,
    ...(isHttps(request) ? ['Secure'] : []),
  ];
  return attributes.join('; ');
}

/** Identifies a client for rate limiting: the visitor's address as reported by the tunnel, if any. */
export function clientKey(request: Request): string {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  return (
    header('cf-connecting-ip') ??
    header('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.socket.remoteAddress ??
    'unknown'
  );
}
