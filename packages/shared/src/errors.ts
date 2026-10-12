import type { z } from 'zod';

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
