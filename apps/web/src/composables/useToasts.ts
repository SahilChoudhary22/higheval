import { readonly, ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

const toasts = ref<Toast[]>([]);
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function dismiss(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

/**
 * App-wide toasts. Errors stay until dismissed; info toasts (e.g. undo) expire
 * after `durationMs`. New toasts never move existing ones.
 */
function show(toast: Omit<Toast, 'id'>, durationMs = 8_000): number {
  const id = nextId++;
  toasts.value = [...toasts.value, { ...toast, id }];
  if (toast.tone !== 'error')
    timers.set(
      id,
      setTimeout(() => {
        dismiss(id);
      }, durationMs),
    );
  return id;
}

export function useToasts() {
  return { toasts: readonly(toasts), show, dismiss };
}
