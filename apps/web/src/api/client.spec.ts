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

describe('getJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a body that matches the contract', async () => {
    mockFetch(200, { status: 'ok', version: '0.1.0', uptimeSeconds: 3 });
    await expect(getJson('/health', healthResponseSchema)).resolves.toEqual({
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: 3,
    });
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
