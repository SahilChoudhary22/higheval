<script setup lang="ts">
import {
  PhBookOpen,
  PhCheck,
  PhCircleDashed,
  PhFlask,
  PhGearSix,
  PhList,
  PhListChecks,
  PhSlidersHorizontal,
  PhSquaresFour,
  PhWarning,
  PhX,
} from '@phosphor-icons/vue';
import { computed, ref, watch, type Component } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useHealth } from '@/composables/useHealth';
import LogoMark from './LogoMark.vue';
import ToastRegion from './ToastRegion.vue';

const NAV = [
  { to: '/', label: 'Overview', icon: PhSquaresFour, exact: true },
  { to: '/experiments', label: 'Experiments', icon: PhFlask },
  { to: '/suites', label: 'Suites', icon: PhListChecks },
  { to: '/configs', label: 'Configs', icon: PhSlidersHorizontal },
  { to: '/skills', label: 'Skills', icon: PhBookOpen },
  { to: '/settings', label: 'Settings', icon: PhGearSix },
];

const route = useRoute();
const menuOpen = ref(false);
watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
);

const isActive = (item: (typeof NAV)[number]): boolean =>
  item.exact ? route.path === item.to : route.path.startsWith(item.to);

const health = useHealth();
type CheckState = 'ok' | 'bad' | 'unknown';

/** Readiness of each dependency; "unknown" while the API itself is unreachable. */
const checks = computed(() => {
  const data = health.data.value;
  const reachable = data !== undefined && !health.error.value;
  const state = (ok: boolean): CheckState => (!reachable ? 'unknown' : ok ? 'ok' : 'bad');
  return [
    {
      label: 'API',
      state: reachable ? 'ok' : 'bad',
      detail: reachable ? `v${data.version}` : 'unreachable',
    },
    {
      label: 'Hermes',
      state: state(Boolean(data?.checks.hermesVersion)),
      detail: !reachable
        ? 'unknown'
        : data.checks.hermesVersion
          ? 'installed'
          : 'run pnpm setup:hermes',
    },
    {
      label: 'Provider keys',
      state: state((data?.checks.configuredProviders.length ?? 0) > 0),
      detail: !reachable
        ? 'unknown'
        : data.checks.configuredProviders.length > 0
          ? `${String(data.checks.configuredProviders.length)} configured`
          : 'add one in Settings',
      to: '/settings',
    },
  ] satisfies { label: string; state: CheckState; detail: string; to?: string }[];
});
const ICON: Record<CheckState, Component> = {
  ok: PhCheck,
  bad: PhWarning,
  unknown: PhCircleDashed,
};
</script>

<template>
  <div class="shell">
    <header class="shell__bar">
      <RouterLink to="/" class="wordmark"><LogoMark class="wordmark__mark" />HighEval</RouterLink>
      <button
        type="button"
        class="btn btn--compact"
        :aria-expanded="menuOpen"
        aria-controls="primary-nav"
        @click="menuOpen = !menuOpen"
      >
        <component :is="menuOpen ? PhX : PhList" aria-hidden="true" />
        Menu
      </button>
    </header>

    <aside id="primary-nav" class="shell__rail" :class="{ 'shell__rail--open': menuOpen }">
      <RouterLink to="/" class="wordmark shell__wordmark">
        <LogoMark class="wordmark__mark" />HighEval
      </RouterLink>
      <nav aria-label="Primary">
        <ul class="nav">
          <li v-for="item in NAV" :key="item.to">
            <RouterLink
              :to="item.to"
              class="nav__link"
              :class="{ 'nav__link--active': isActive(item) }"
              :aria-current="isActive(item) ? 'page' : undefined"
            >
              <component
                :is="item.icon"
                class="nav__icon"
                :weight="isActive(item) ? 'fill' : 'regular'"
                aria-hidden="true"
              />
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
      <dl class="health" aria-label="System status">
        <div v-for="check in checks" :key="check.label" class="health__row">
          <dt class="label">{{ check.label }}</dt>
          <dd :class="`health__${check.state}`">
            <component :is="ICON[check.state]" aria-hidden="true" />
            <RouterLink v-if="check.to" :to="check.to" class="health__link">{{
              check.detail
            }}</RouterLink>
            <template v-else>{{ check.detail }}</template>
          </dd>
        </div>
      </dl>
    </aside>

    <main class="shell__main">
      <slot />
    </main>
    <ToastRegion />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-family: var(--font-outlier);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-heading);
  color: var(--color-ink);
  text-decoration: none;
}

.wordmark__mark {
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
}

.shell__bar {
  position: sticky;
  top: 0;
  z-index: var(--z-nav);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--banner-height);
  padding: 0 var(--gutter);
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-paper);
}

.shell__rail {
  display: none;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-lg) var(--space-lg) var(--space-md);
  background: var(--color-paper);
}

.shell__rail--open {
  position: fixed;
  inset: var(--banner-height) 0 0;
  z-index: var(--z-nav);
  display: flex;
  overflow-y: auto;
}

.shell__wordmark {
  display: none;
}

.shell__main {
  max-width: var(--content-max);
  padding: var(--space-xl) var(--gutter) var(--space-3xl);
}

.nav {
  display: grid;
  gap: var(--space-3xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav__link {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-inline: calc(-1 * var(--space-xs));
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-control);
  color: var(--color-ink-2);
  font-weight: 600;
  text-decoration: none;
}

.nav__icon {
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
}

/* Active: accent colour, a tinted background and a filled icon, so it never relies on colour alone. */
.nav__link--active {
  background: var(--color-accent-tint);
  color: var(--color-accent);
}

@media (hover: hover) {
  .nav__link:hover {
    color: var(--color-ink);
  }

  .nav__link--active:hover {
    color: var(--color-accent-hover);
  }
}

.health {
  display: grid;
  gap: var(--space-xs);
  margin: auto 0 0;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-rule);
}

.health__row {
  display: grid;
  gap: var(--space-3xs);
}

.health dd {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin: 0;
  font-size: var(--text-sm);
}

.health dd svg {
  width: 0.875rem;
  height: 0.875rem;
  flex: none;
}

.health__link {
  color: inherit;
  text-decoration-color: var(--color-rule-strong);
}

.health__ok {
  color: var(--color-ink-2);
}

.health__ok svg {
  color: var(--color-better);
}

.health__bad {
  color: var(--color-error);
}

.health__unknown {
  color: var(--color-muted);
}

@media (width >= 60rem) {
  .shell {
    display: grid;
    grid-template-columns: var(--rail-width) minmax(0, 1fr);
  }

  .shell__bar {
    display: none;
  }

  .shell__rail {
    position: sticky;
    top: 0;
    display: flex;
    height: 100dvh;
    border-right: 1px solid var(--color-rule);
  }

  .shell__wordmark {
    display: inline-flex;
    align-self: flex-start;
  }
}
</style>
