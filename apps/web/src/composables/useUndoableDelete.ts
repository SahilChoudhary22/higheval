import { ApiError } from '@/api/client';
import { useToasts } from './useToasts';

const UNDO_WINDOW_MS = 8_000;

/**
 * Optimistic delete with an undo window instead of a confirmation dialog:
 * hide the item immediately, delete on the server only when the window
 * closes, and restore it if the user undoes or the server refuses.
 */
export function useUndoableDelete() {
  const { show, dismiss } = useToasts();

  return function remove(options: {
    label: string;
    hide: () => void;
    restore: () => void;
    commit: () => Promise<void>;
  }): void {
    options.hide();
    let undone = false;
    const toastId = show(
      {
        message: `Deleted ${options.label}.`,
        tone: 'info',
        action: {
          label: 'Undo',
          run: () => {
            undone = true;
            dismiss(toastId);
            options.restore();
          },
        },
      },
      UNDO_WINDOW_MS,
    );
    setTimeout(() => {
      if (undone) return;
      options.commit().catch((error: unknown) => {
        options.restore();
        show({
          message:
            error instanceof ApiError
              ? `Couldn't delete ${options.label}. ${error.message}`
              : `Couldn't delete ${options.label}.`,
          tone: 'error',
        });
      });
    }, UNDO_WINDOW_MS);
  };
}
