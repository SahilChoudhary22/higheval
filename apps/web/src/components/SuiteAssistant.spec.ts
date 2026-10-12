import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuiteDraft, SuiteDraftRequest, SuiteInput } from '@higheval/shared';
import { ApiError } from '@/api/client';
import SuiteAssistant from './SuiteAssistant.vue';

const TASK: SuiteInput['tasks'][number] = {
  key: 'double-booked',
  title: 'Double-booked',
  prompt: 'Find conflicts.',
  scorers: [{ type: 'file_exists', path: 'conflicts.json' }],
};
const SUITE: SuiteInput = { name: 'Clinic', tasks: [TASK] };

const draft = (overrides: Partial<SuiteDraft>): SuiteDraft => ({
  id: 'd1',
  status: 'running',
  description: 'Clinic tasks',
  revision: false,
  model: { provider: 'openrouter', model: 'vendor/model' },
  attempt: 1,
  maxAttempts: 3,
  activity: [],
  suite: null,
  checks: [],
  error: null,
  createdAt: '2026-10-12T10:00:00.000Z',
  finishedAt: null,
  ...overrides,
});

const api = vi.hoisted(() => ({
  start: vi.fn<(input: SuiteDraftRequest) => Promise<SuiteDraft>>(),
  get: vi.fn<(id: string) => Promise<SuiteDraft>>(),
  cancel: vi.fn<(id: string) => Promise<SuiteDraft>>(),
}));

vi.mock('@/api/endpoints', () => ({ api: { suiteDrafts: api } }));

const DESCRIPTION = 'Three tasks for a dental clinic front desk.';

const applyButton = (wrapper: VueWrapper) => {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text() === 'Apply to editor');
  if (!button) throw new Error('No "Apply to editor" button');
  return button;
};

describe('SuiteAssistant', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('starts a draft, shows progress, and hands the finished suite to the editor', async () => {
    api.start.mockResolvedValue(
      draft({ activity: [{ at: '2026-10-12T10:00:01.000Z', text: 'read_file: request.md' }] }),
    );
    api.get.mockResolvedValue(
      draft({
        status: 'ready',
        attempt: 2,
        suite: SUITE as SuiteDraft['suite'],
        checks: [{ taskKey: 'double-booked', passed: true, problems: [] }],
        finishedAt: '2026-10-12T10:01:30.000Z',
      }),
    );
    const wrapper = mount(SuiteAssistant);
    await wrapper.get('textarea').setValue(DESCRIPTION);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.start).toHaveBeenCalledWith({ description: DESCRIPTION });
    expect(wrapper.text()).toContain('Attempt 1 of 3');
    expect(wrapper.text()).toContain('read_file: request.md');

    await vi.advanceTimersByTimeAsync(2_000);
    await flushPromises();
    expect(wrapper.text()).toContain('Drafted 1 task in 1 m 30 s (2 attempts)');
    expect(wrapper.text()).toContain('1/1 reference answers pass');
    // The draft is previewed, not pushed into the editor until applied.
    expect(wrapper.emitted('drafted')).toBeUndefined();
    expect(wrapper.get('pre').text()).toContain('"double-booked"');

    await applyButton(wrapper).trigger('click');
    expect(wrapper.emitted('drafted')).toEqual([[SUITE]]);
    expect(wrapper.get('[role="status"]').text()).toBe('Applied to the editor');
  });

  it('summarises what the draft changes in the editor', async () => {
    const revised: SuiteInput = {
      ...SUITE,
      tasks: [
        { ...TASK, prompt: 'Find every conflict.' },
        { ...TASK, key: 'no-shows', title: 'No-shows' },
      ],
    };
    api.start.mockResolvedValue(draft({ status: 'ready', suite: revised as SuiteDraft['suite'] }));
    const wrapper = mount(SuiteAssistant, { props: { current: SUITE, revising: true } });
    await wrapper.get('textarea').setValue(DESCRIPTION);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain(
      'Compared with the editor, this draft adds no-shows, changes double-booked.',
    );
  });

  it('offers to revise the draft it just produced', async () => {
    api.start.mockResolvedValue(draft({ status: 'ready', suite: SUITE as SuiteDraft['suite'] }));
    const wrapper = mount(SuiteAssistant, { props: { current: SUITE } });
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    await wrapper.get('textarea').setValue(DESCRIPTION);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await applyButton(wrapper).trigger('click');
    const revise = wrapper.get<HTMLInputElement>('input[type="checkbox"]');
    expect(revise.element.checked).toBe(true);

    await wrapper.get('textarea').setValue('Make the double-booking task stricter.');
    await wrapper.get('form').trigger('submit');
    expect(api.start).toHaveBeenLastCalledWith({
      description: 'Make the double-booking task stricter.',
      suite: SUITE,
    });
  });

  it('validates the description locally and shows API errors on the field', async () => {
    const wrapper = mount(SuiteAssistant);
    await wrapper.get('textarea').setValue('too short');
    await wrapper.get('form').trigger('submit');
    expect(api.start).not.toHaveBeenCalled();
    expect(wrapper.get('#draft-description-help').text()).toContain('sentence or two');

    api.start.mockRejectedValue(
      new ApiError('Validation failed', 400, [
        { path: 'description', message: 'No OpenRouter key.' },
      ]),
    );
    await wrapper.get('textarea').setValue(DESCRIPTION);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('#draft-description-help').text()).toBe('No OpenRouter key.');
  });

  it('reports a failed draft', async () => {
    api.start.mockResolvedValue(
      draft({ status: 'failed', error: 'No valid suite after 3 attempts.' }),
    );
    const wrapper = mount(SuiteAssistant);
    await wrapper.get('textarea').setValue(DESCRIPTION);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('No valid suite after 3 attempts.');
    expect(wrapper.emitted('drafted')).toBeUndefined();
  });
});
