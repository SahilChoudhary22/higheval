import type { Session } from '@higheval/shared';
import { readonly, ref } from 'vue';
import { api } from '@/api/endpoints';

const session = ref<Session | null>(null);
let pending: Promise<Session> | null = null;

/** Loads the session once and shares it; `force` re-reads it (after signing in or out). */
async function load(force = false): Promise<Session> {
  if (session.value && !force) return session.value;
  pending ??= api.auth.session().finally(() => {
    pending = null;
  });
  session.value = await pending;
  return session.value;
}

async function signOut(): Promise<void> {
  await api.auth.logout();
  session.value = { authRequired: true, authenticated: false, username: null };
}

/** Whether this deployment requires sign-in, and who is signed in. */
export function useSession() {
  return { session: readonly(session), load, signOut };
}
