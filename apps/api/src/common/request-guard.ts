import type { NextFunction, Request, Response } from 'express';

/** Loopback names the API always answers to. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Hostname from a Host header or URL authority, without port or IPv6 brackets. */
export function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname
      .replace(/^\[|\]$/g, '')
      .toLowerCase();
  } catch {
    return null;
  }
}

export interface GuardDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Decides whether a request may reach the API. The API can launch agents that
 * run tools on this machine, so it rejects:
 * - requests addressed to an unexpected Host (DNS rebinding: a hostile site
 *   re-pointing its own name at 127.0.0.1);
 * - state-changing requests sent by another site's pages (CSRF), detected via
 *   the Origin and Sec-Fetch-Site headers browsers attach automatically.
 * Non-browser clients (curl, scripts) send neither header and are unaffected.
 */
export function checkRequest(
  request: { method: string; headers: Record<string, string | string[] | undefined> },
  allowedHosts: ReadonlySet<string>,
): GuardDecision {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const host = hostnameOf(header('host'));
  if (!host || !allowedHosts.has(host)) {
    return { allowed: false, reason: `Host "${host ?? 'missing'}" is not allowed` };
  }
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { allowed: true };
  if (header('sec-fetch-site') === 'cross-site') {
    return { allowed: false, reason: 'Cross-site requests are not allowed' };
  }
  const origin = header('origin');
  if (origin !== undefined && origin !== 'null') {
    const originHost = hostnameOf(origin);
    if (!originHost || !allowedHosts.has(originHost)) {
      return { allowed: false, reason: `Origin "${origin}" is not allowed` };
    }
  } else if (origin === 'null') {
    return { allowed: false, reason: 'Opaque origins are not allowed' };
  }
  return { allowed: true };
}

export function createRequestGuard(allowedHosts: ReadonlySet<string>) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const decision = checkRequest(request, allowedHosts);
    if (decision.allowed) {
      next();
      return;
    }
    response.status(403).json({ statusCode: 403, error: 'Forbidden', message: decision.reason });
  };
}
