import { checkRequest, hostnameOf, LOOPBACK_HOSTS } from './request-guard.js';

const allowed = new Set<string>([...LOOPBACK_HOSTS, 'higheval.example.com']);
const req = (method: string, headers: Record<string, string>) => ({ method, headers });

describe('hostnameOf', () => {
  it('strips ports, schemes and IPv6 brackets', () => {
    expect(hostnameOf('127.0.0.1:3000')).toBe('127.0.0.1');
    expect(hostnameOf('[::1]:3000')).toBe('::1');
    expect(hostnameOf('https://HighEval.example.com')).toBe('higheval.example.com');
    expect(hostnameOf(undefined)).toBeNull();
  });
});

describe('checkRequest', () => {
  it('allows local and configured hosts', () => {
    expect(checkRequest(req('GET', { host: 'localhost:5173' }), allowed).allowed).toBe(true);
    expect(checkRequest(req('POST', { host: 'higheval.example.com' }), allowed).allowed).toBe(true);
  });

  it('rejects unexpected Host headers (DNS rebinding)', () => {
    expect(checkRequest(req('GET', { host: 'attacker.example:3000' }), allowed)).toEqual({
      allowed: false,
      reason: 'Host "attacker.example" is not allowed',
    });
  });

  it('rejects state-changing requests from other sites (CSRF)', () => {
    expect(
      checkRequest(
        req('POST', { host: 'localhost:3000', origin: 'https://attacker.example' }),
        allowed,
      ).allowed,
    ).toBe(false);
    expect(
      checkRequest(
        req('DELETE', { host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }),
        allowed,
      ).allowed,
    ).toBe(false);
    expect(
      checkRequest(req('POST', { host: 'localhost:3000', origin: 'null' }), allowed).allowed,
    ).toBe(false);
  });

  it('allows same-origin browser requests and non-browser clients', () => {
    expect(
      checkRequest(
        req('POST', { host: 'localhost:5173', origin: 'http://localhost:5173' }),
        allowed,
      ).allowed,
    ).toBe(true);
    expect(checkRequest(req('POST', { host: '127.0.0.1:3000' }), allowed).allowed).toBe(true);
  });

  it('lets cross-site reads through (responses are not readable cross-origin without CORS)', () => {
    expect(
      checkRequest(req('GET', { host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }), allowed)
        .allowed,
    ).toBe(true);
  });
});
