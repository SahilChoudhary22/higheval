import { readonly, ref } from 'vue';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Must match the inline script in index.html, which applies the theme before first paint. */
export const THEME_STORAGE_KEY = 'higheval:theme';

const media = window.matchMedia('(prefers-color-scheme: dark)');

function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const preference = ref<ThemePreference>(stored());

function apply(): void {
  const dark = preference.value === 'dark' || (preference.value === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

media.addEventListener('change', apply);
apply();

function setPreference(next: ThemePreference): void {
  preference.value = next;
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this page.
  }
  apply();
}

/** App-wide colour theme: follows the system unless the user picks light or dark. */
export function useTheme() {
  return { preference: readonly(preference), setPreference };
}
