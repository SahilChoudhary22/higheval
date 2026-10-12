import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A controllable `prefers-color-scheme: dark` query. */
function stubSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    change(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

const loadTheme = async () => (await import('./useTheme')).useTheme();
const applied = () => document.documentElement.dataset.theme;

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the system theme by default, including later changes', async () => {
    const system = stubSystemTheme(true);
    const { preference } = await loadTheme();
    expect(preference.value).toBe('system');
    expect(applied()).toBe('dark');
    system.change(false);
    expect(applied()).toBe('light');
  });

  it('applies and remembers an explicit choice over the system theme', async () => {
    const system = stubSystemTheme(true);
    const { setPreference } = await loadTheme();
    setPreference('light');
    expect(applied()).toBe('light');
    expect(localStorage.getItem('higheval:theme')).toBe('light');
    system.change(true);
    expect(applied()).toBe('light');

    vi.resetModules();
    stubSystemTheme(true);
    expect((await loadTheme()).preference.value).toBe('light');
  });

  it('forgets the choice when switching back to system', async () => {
    stubSystemTheme(false);
    const { setPreference } = await loadTheme();
    setPreference('dark');
    setPreference('system');
    expect(localStorage.getItem('higheval:theme')).toBeNull();
    expect(applied()).toBe('light');
  });
});
