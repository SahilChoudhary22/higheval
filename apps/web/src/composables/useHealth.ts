import type { HealthResponse } from '@higheval/shared';
import { effectScope } from 'vue';
import { api } from '@/api/endpoints';
import { useResource, type Resource } from './useResource';

let shared: Resource<HealthResponse> | undefined;

/**
 * One app-wide health poll, shared by the status rail and the overview, so
 * saving a provider key can refresh both at once.
 */
export function useHealth(): Resource<HealthResponse> {
  shared ??= effectScope(true).run(() => useResource(() => api.health(), { pollMs: () => 30_000 }));
  if (!shared) throw new Error('Health resource failed to initialise');
  return shared;
}
