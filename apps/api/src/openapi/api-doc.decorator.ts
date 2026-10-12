import { SetMetadata } from '@nestjs/common';
import type { z } from 'zod';

export const API_DOC = 'higheval:api-doc';

export interface ApiDocOptions {
  summary: string;
  description?: string;
  /** Request body contract; documented in its input form (defaults optional). */
  body?: z.ZodType;
  /** JSON response contract for the success status. */
  response?: z.ZodType;
  /** A non-JSON success body, e.g. a Markdown report. */
  produces?: 'text/markdown' | 'text/html';
  /** Descriptions of path parameters, by name. */
  params?: Record<string, string>;
  /** Leave the route out of the document (e.g. the docs page itself). */
  hidden?: boolean;
}

/**
 * Documents a route with the same shared Zod schemas that validate it, so
 * the OpenAPI document cannot drift from the code. Every route must have one;
 * a test enforces it.
 */
export const ApiDoc = (options: ApiDocOptions): MethodDecorator => SetMetadata(API_DOC, options);
