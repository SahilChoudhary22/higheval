import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useResource } from './useResource';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const handlers: { settle?: (value: T) => void } = {};
  const promise = new Promise<T>((settle) => {
    handlers.settle = settle;
  });
  return { promise, resolve: (value) => handlers.settle?.(value) };
}

describe('useResource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls while asked to and stops when the poll interval becomes null', async () => {
    let calls = 0;
    const fetcher = vi.fn<() => Promise<number>>(() => Promise.resolve(++calls));
    const scope = effectScope();
    const resource = scope.run(() =>
      useResource(fetcher, { pollMs: (count) => ((count ?? 0) < 3 ? 1_000 : null) }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(resource?.data.value).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(resource?.data.value).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
    scope.stop();
  });

  it('discards a stale response that arrives after a newer request', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const responses = [first, second];
    const id = ref('a');
    const scope = effectScope();
    const resource = scope.run(() =>
      useResource(() => responses.shift()?.promise ?? Promise.resolve('unexpected'), {
        source: () => id.value,
      }),
    );
    id.value = 'b';
    await nextTick();
    second.resolve('fresh');
    await vi.advanceTimersByTimeAsync(0);
    first.resolve('stale');
    await vi.advanceTimersByTimeAsync(0);
    expect(resource?.data.value).toBe('fresh');
    scope.stop();
  });

  it('keeps the last good data and reports the error when a refresh fails', async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('down'));
    const scope = effectScope();
    const resource = scope.run(() => useResource(fetcher, { pollMs: () => 1_000 }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(resource?.data.value).toBe('ok');
    expect(resource?.error.value?.message).toBe('down');
    scope.stop();
  });

  it('stops polling when its scope is disposed', async () => {
    const fetcher = vi.fn<() => Promise<number>>(() => Promise.resolve(1));
    const scope = effectScope();
    scope.run(() => useResource(fetcher, { pollMs: () => 1_000 }));
    await vi.advanceTimersByTimeAsync(0);
    scope.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
