import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoginInput, Session } from '@higheval/shared';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '@/api/client';
import LoginView from './LoginView.vue';

const api = vi.hoisted(() => ({
  login: vi.fn<(input: LoginInput) => Promise<undefined>>(),
  session: vi.fn<() => Promise<Session>>(),
}));
vi.mock('@/api/endpoints', () => ({ api: { auth: api } }));

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/:rest(.*)*', component: { template: '<p>app</p>' } },
    ],
  });
  await router.push(path);
  const wrapper = mount(LoginView, { global: { plugins: [router] }, attachTo: document.body });
  return { wrapper, router };
}

describe('LoginView', () => {
  afterEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = '';
  });

  it('signs in and returns to the page that asked for it', async () => {
    api.login.mockResolvedValue(undefined);
    api.session.mockResolvedValue({
      authRequired: true,
      authenticated: true,
      username: 'highlevel',
    });
    const { wrapper, router } = await mountAt('/login?next=/experiments/abc');
    await wrapper.get('#username').setValue('highlevel');
    await wrapper.get('#password').setValue('secret');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.login).toHaveBeenCalledWith({ username: 'highlevel', password: 'secret' });
    expect(router.currentRoute.value.fullPath).toBe('/experiments/abc');
  });

  it('never redirects to another site after sign-in', async () => {
    api.login.mockResolvedValue(undefined);
    api.session.mockResolvedValue({
      authRequired: true,
      authenticated: true,
      username: 'highlevel',
    });
    const { wrapper, router } = await mountAt('/login?next=//evil.example/phish');
    await wrapper.get('#username').setValue('highlevel');
    await wrapper.get('#password').setValue('secret');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it('asks for both fields before calling the API', async () => {
    const { wrapper } = await mountAt('/login');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.login).not.toHaveBeenCalled();
    expect(wrapper.get('#username-help').text()).toBe('Enter your username');
    expect(document.activeElement?.id).toBe('username');
  });

  it('shows a wrong-password error and clears the password', async () => {
    api.login.mockRejectedValue(new ApiError('Wrong username or password', 401));
    const { wrapper } = await mountAt('/login');
    await wrapper.get('#username').setValue('highlevel');
    await wrapper.get('#password').setValue('nope');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Wrong username or password');
    expect(wrapper.get<HTMLInputElement>('#password').element.value).toBe('');
  });

  it('can reveal the password', async () => {
    const { wrapper } = await mountAt('/login');
    const toggle = wrapper.get('button[aria-label="Show password"]');
    await toggle.trigger('click');
    expect(wrapper.get('#password').attributes('type')).toBe('text');
    expect(wrapper.get('button[aria-label="Hide password"]').attributes('aria-pressed')).toBe(
      'true',
    );
  });
});
