import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Comparison,
  ConfigSnapshot,
  Experiment,
  RunProgress,
  RunSummary,
} from '@higheval/shared';
import { createMemoryHistory, createRouter } from 'vue-router';
import ExperimentView from './ExperimentView.vue';

const snapshot = (name: string): ConfigSnapshot => ({
  id: name,
  name,
  description: '',
  model: { provider: 'openrouter', model: `vendor/${name}` },
  skills: [],
  memory: { mode: 'disabled' },
  toolsets: ['file'],
  maxTurns: 10,
  timeoutSeconds: 120,
  hash: 'a'.repeat(64),
});

const progress = (scored: number, running: number): RunProgress => ({
  total: 4,
  queued: 4 - scored - running,
  running,
  scored,
  errored: 0,
  cancelled: 0,
});

const experiment = (status: Experiment['status'], scored: number, running: number): Experiment => ({
  id: 'exp',
  name: 'Experiment',
  suiteId: 'suite',
  suiteName: 'Suite',
  suiteHash: 'b'.repeat(64),
  baseline: snapshot('base'),
  candidate: snapshot('cand'),
  repetitions: 1,
  practicalMargin: 0.05,
  seed: 1,
  status,
  progress: progress(scored, running),
  createdAt: '2026-10-12T10:00:00.000Z',
  startedAt: '2026-10-12T10:00:00.000Z',
  finishedAt: status === 'completed' ? '2026-10-12T10:01:00.000Z' : null,
});

const api = vi.hoisted(() => ({
  get: vi.fn<(id: string) => Promise<Experiment>>(),
  runs: vi.fn<(id: string) => Promise<RunSummary[]>>(),
  comparison: vi.fn<(id: string) => Promise<Comparison>>(),
  cancel: vi.fn<(id: string) => Promise<Experiment>>(),
  remove: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock('@/api/endpoints', () => ({ api: { experiments: api } }));

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const handlers: { settle?: (value: T) => void } = {};
  const promise = new Promise<T>((settle) => {
    handlers.settle = settle;
  });
  return { promise, resolve: (value) => handlers.settle?.(value) };
}

describe('ExperimentView polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.runs.mockResolvedValue([]);
    api.comparison.mockRejectedValue(new Error('not needed'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('keeps runs fresh even when they load before the experiment, and refreshes on completion', async () => {
    // Runs resolve immediately; the experiment resolves later (the original race).
    const first = deferred<Experiment>();
    api.get
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(experiment('running', 2, 1))
      .mockResolvedValue(experiment('completed', 4, 0));

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    });
    mount(ExperimentView, { props: { id: 'exp' }, global: { plugins: [router] } });
    await flushPromises();
    expect(api.runs).toHaveBeenCalledTimes(1);

    first.resolve(experiment('running', 1, 1));
    await flushPromises();

    await vi.advanceTimersByTimeAsync(3_000); // progress changed: 1 → 2 scored
    expect(api.runs).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3_000); // completed: final refresh
    expect(api.runs).toHaveBeenCalledTimes(3);
    expect(api.comparison).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(30_000); // finished experiments stop polling
    expect(api.get).toHaveBeenCalledTimes(3);
  });
});
