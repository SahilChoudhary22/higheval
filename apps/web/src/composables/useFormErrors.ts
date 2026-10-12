import { friendlyError } from '@higheval/shared';
import { nextTick, ref } from 'vue';
import type { z } from 'zod';
import { ApiError } from '@/api/client';

const ATTENTION = 'Some fields need attention.';

/** True when `path` is `field` or nested under it ("memory" claims "memory.entries.0"). */
const belongsTo = (path: string, field: string): boolean =>
  path === field || path.startsWith(`${field}.`);

/** Moves focus to the first invalid control in `root` once the DOM has updated. */
async function focusFirstInvalid(root: HTMLElement | null | undefined): Promise<void> {
  await nextTick();
  root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

/**
 * Field-level errors from client-side schema validation or the API's 400
 * response, keyed by dotted path (e.g. "model.model", "tasks.0.key").
 */
export function useFormErrors() {
  const errors = ref<Record<string, string>>({});
  const formError = ref<string | null>(null);

  function setIssues(issues: { path: string; message: string }[]): void {
    errors.value = Object.fromEntries(issues.map((issue) => [issue.path, issue.message]));
    formError.value = issues.length > 0 ? ATTENTION : null;
  }

  function validate<T>(schema: z.ZodType<T>, value: unknown): T | null {
    const result = schema.safeParse(value, { error: friendlyError });
    setIssues(
      result.success
        ? []
        : result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
    );
    return result.success ? result.data : null;
  }

  function fromError(error: unknown): void {
    if (error instanceof ApiError && error.issues.length > 0) setIssues(error.issues);
    else formError.value = error instanceof Error ? error.message : String(error);
  }

  /** The first error for a field or anything nested under it. */
  function errorFor(field: string): string | undefined {
    return Object.entries(errors.value).find(([path]) => belongsTo(path, field))?.[1];
  }

  /**
   * Errors no rendered field claims (e.g. a whole-object refinement), so the
   * form can list them instead of failing silently.
   */
  function unclaimed(fields: readonly string[]): string[] {
    return Object.entries(errors.value)
      .filter(([path]) => !fields.some((field) => belongsTo(path, field)))
      .map(([path, message]) => (path ? `${path}: ${message}` : message));
  }

  function clear(): void {
    errors.value = {};
    formError.value = null;
  }

  return { errors, formError, validate, fromError, errorFor, unclaimed, focusFirstInvalid, clear };
}
