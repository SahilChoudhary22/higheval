import { apiErrorSchema, type FieldIssue } from '@higheval/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Calls the API and validates the response against the shared contract, so a
 * backend/frontend mismatch fails loudly instead of rendering undefined fields.
 */
async function call<T>(
  method: Method,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // A session that expired (or a deployment that now requires sign-in) sends the user to log in.
  if (response.status === 401 && !path.startsWith('/auth/')) redirectToLogin();
  if (!response.ok) throw await toApiError(method, path, response);
  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json());
}

function redirectToLogin(): void {
  const here = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname !== '/login') {
    window.location.assign(`/login?next=${encodeURIComponent(here)}`);
  }
}

async function toApiError(method: Method, path: string, response: Response): Promise<ApiError> {
  const fallback = `${method} ${path} failed with ${String(response.status)}`;
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (!parsed.success) return new ApiError(fallback, response.status);
    const { message, issues } = parsed.data;
    const text = Array.isArray(message) ? message.join('; ') : message;
    return new ApiError(text ?? fallback, response.status, issues ?? []);
  } catch {
    return new ApiError(fallback, response.status);
  }
}

export const getJson = <T>(path: string, schema: z.ZodType<T>): Promise<T> =>
  call('GET', path, schema);
export const postJson = <T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> =>
  call('POST', path, schema, body);
export const putJson = <T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> =>
  call('PUT', path, schema, body);
export const deleteResource = (path: string): Promise<void> => call('DELETE', path, z.undefined());
