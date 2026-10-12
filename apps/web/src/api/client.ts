import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetches a JSON resource from the API and validates it against the shared
 * contract, so a backend/frontend mismatch fails loudly instead of rendering
 * undefined fields.
 */
export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new ApiError(`GET ${path} failed with ${String(response.status)}`, response.status);
  }
  return schema.parse(await response.json());
}
