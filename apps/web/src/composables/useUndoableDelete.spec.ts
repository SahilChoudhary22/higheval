import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToasts } from './useToasts';
import { useUndoableDelete } from './useUndoableDelete';

function setup(commit: () => Promise<void> = () => Promise.resolve()) {
  const calls = { hide: 0, restore: 0, commit: 0 };
  useUndoableDelete()({
    label: '"Suite"',
    hide: () => calls.hide++,
    restore: () => calls.restore++,
    commit: () => {
      calls.commit++;
      return commit();
    },
  });
  return calls;
}

describe('useUndoableDelete', () => {
  const { toasts, dismiss } = useToasts();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const toast of toasts.value) dismiss(toast.id);
    vi.useRealTimers();
  });

  it('hides immediately and deletes on the server only after the undo window', async () => {
    const calls = setup();
    expect(calls).toEqual({ hide: 1, restore: 0, commit: 0 });
    expect(toasts.value[0]?.message).toBe('Deleted "Suite".');
    await vi.advanceTimersByTimeAsync(8_000);
    expect(calls.commit).toBe(1);
  });

  it('restores the item and never deletes when undone', async () => {
    const calls = setup();
    toasts.value[0]?.action?.run();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(calls).toEqual({ hide: 1, restore: 1, commit: 0 });
  });

  it('restores the item and shows an error when the server refuses', async () => {
    const calls = setup(() => Promise.reject(new Error('in use')));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(calls.restore).toBe(1);
    expect(
      toasts.value.some(
        (toast) => toast.tone === 'error' && toast.message.startsWith("Couldn't delete"),
      ),
    ).toBe(true);
  });
});
