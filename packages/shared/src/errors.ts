import { z } from 'zod';

/** A problem with one input field, keyed by its dotted path (e.g. `tasks.0.key`). */
export const fieldIssueSchema = z.object({ path: z.string(), message: z.string() });
export type FieldIssue = z.infer<typeof fieldIssueSchema>;

/**
 * Body of every 4xx/5xx response. Validation failures (400) carry one issue
 * per invalid field so forms can show each message next to its field.
 */
export const apiErrorSchema = z.object({
  message: z.union([z.string(), z.array(z.string())]).optional(),
  issues: z.array(fieldIssueSchema).optional(),
  error: z.string().optional(),
  statusCode: z.int().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

type Bound = number | bigint;

const characters = (count: Bound): string =>
  `${String(count)} character${Number(count) === 1 ? '' : 's'}`;

/**
 * Plain-language messages for Zod's generic issues, passed per parse
 * (`schema.safeParse(value, { error: friendlyError })`) by both the API and the
 * web forms. Messages written on a schema take precedence.
 */
export const friendlyError: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'too_small': {
      const min = issue.minimum;
      if (issue.origin === 'string')
        return Number(min) <= 1 ? 'Required' : `Use at least ${characters(min)}`;
      if (issue.origin === 'array')
        return Number(min) <= 1 ? 'Add at least one' : `Add at least ${String(min)}`;
      if (issue.origin === 'number' || issue.origin === 'int')
        return `Must be at least ${String(min)}`;
      return undefined;
    }
    case 'too_big': {
      const max = issue.maximum;
      if (issue.origin === 'string') return `Use at most ${characters(max)}`;
      if (issue.origin === 'array') return `Use at most ${String(max)}`;
      if (issue.origin === 'number' || issue.origin === 'int')
        return `Must be at most ${String(max)}`;
      return undefined;
    }
    case 'invalid_type':
      if (issue.input === undefined) return 'Required';
      if (issue.expected === 'number' || issue.expected === 'int') return 'Enter a number';
      return undefined;
    default:
      return undefined;
  }
};
