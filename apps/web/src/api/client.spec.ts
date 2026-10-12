import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { healthResponseSchema } from '@higheval/shared';
import { ApiError, getJson } from './client';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

const HEALTHY = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 3,
  checks: { configuredProviders: ['openrouter'], hermesVersion: 'Hermes 1.0' },
  maxConcurrentRuns: 4,
};

describe('getJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a body that matches the contract', async () => {
    mockFetch(200, HEALTHY);
    await expect(getJson('/health', healthResponseSchema)).resolves.toEqual(HEALTHY);
  });

  it('throws ApiError on a non-2xx response', async () => {
    mockFetch(503, {});
    await expect(getJson('/health', healthResponseSchema)).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a body that violates the contract', async () => {
    mockFetch(200, { status: 'unknown' });
    await expect(getJson('/health', healthResponseSchema)).rejects.toBeInstanceOf(ZodError);
  });
});
