import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from './auth.service.js';
import { sessionToken } from './session-cookie.js';

/** API routes reachable without signing in: sign-in itself, and the health check. */
const PUBLIC_API = new Set([
  '/api/health',
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/logout',
]);

/**
 * When sign-in is enabled, every API route except PUBLIC_API needs a valid
 * session; the single-page app itself is public so it can show the login
 * screen. Enforced here, on the server, not by hiding pages in the UI.
 */
export function createAuthGate(auth: AuthService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const path = request.path;
    const isApi = path === '/api' || path.startsWith('/api/');
    if (
      !auth.enabled ||
      !isApi ||
      PUBLIC_API.has(path) ||
      auth.verifyToken(sessionToken(request))
    ) {
      next();
      return;
    }
    response.status(401).json({ message: 'Sign in required', statusCode: 401 });
  };
}
