import { ref } from 'vue';
import type { z } from 'zod';
import { ApiError } from '@/api/client';

/**
 * Field-level errors from client-side schema validation or the API's 400
 * response, keyed by dotted path (e.g. "model.model", "tasks.0.key").
 */
export function useFormErrors() {
  const errors = ref<Record<string, string>>({});
  const formError = ref<string | null>(null);

  function validate<T>(schema: z.ZodType<T>, value: unknown): T | null {
    const result = schema.safeParse(value);
    errors.value = result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        );
    return result.success ? result.data : null;
  }

  function fromError(error: unknown): void {
    if (error instanceof ApiError && error.issues.length > 0) {
      errors.value = Object.fromEntries(error.issues.map((issue) => [issue.path, issue.message]));
      formError.value = 'Some fields need attention.';
    } else {
      formError.value = error instanceof Error ? error.message : String(error);
    }
  }

  function clear(): void {
    errors.value = {};
    formError.value = null;
  }

  return { errors, formError, validate, fromError, clear };
}
