import { z } from 'zod';

export const idSchema = z.string().min(1).max(64);

/** ISO-8601 timestamp string, as serialized by the API. */
export const timestampSchema = z.iso.datetime();

/** Lowercase slug used for task keys and skill names (also a safe directory name). */
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens');

/** Workspace-relative file path; rejects absolute paths and parent traversal. */
export const relativePathSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (path) => !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..'),
    'Must be a relative path without ".." segments',
  );
