import { onScopeDispose, ref, shallowRef, watch, type Ref, type WatchSource } from 'vue';

export interface Resource<T> {
  data: Ref<T | undefined>;
  error: Ref<Error | undefined>;
  loading: Ref<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Loads async data with loading/error state. Re-fetches when `source` changes
 * and, if `pollMs` returns a number, keeps polling (e.g. while an experiment
 * runs). Stale responses from superseded requests are discarded.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  options: { source?: WatchSource; pollMs?: (data: T | undefined) => number | null } = {},
): Resource<T> {
  const data = shallowRef<T>();
  const error = ref<Error>();
  const loading = ref(false);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (): void => {
    clearTimeout(timer);
    const delay = options.pollMs?.(data.value) ?? null;
    if (delay !== null) timer = setTimeout(() => void refresh(), delay);
  };

  async function refresh(): Promise<void> {
    const current = ++generation;
    loading.value = true;
    try {
      const result = await fetcher();
      if (current !== generation) return;
      data.value = result;
      error.value = undefined;
    } catch (cause) {
      if (current !== generation) return;
      error.value = cause instanceof Error ? cause : new Error(String(cause));
    } finally {
      if (current === generation) {
        loading.value = false;
        schedule();
      }
    }
  }

  if (options.source) watch(options.source, () => void refresh(), { immediate: true });
  else void refresh();
  onScopeDispose(() => {
    generation++;
    clearTimeout(timer);
  });

  return { data, error, loading, refresh };
}
