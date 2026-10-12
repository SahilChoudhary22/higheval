<script setup lang="ts">
import { PhFlask } from '@phosphor-icons/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/endpoints';
import EmptyState from '@/components/EmptyState.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import ExperimentTable from '@/components/ExperimentTable.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useHealth } from '@/composables/useHealth';
import { useResource } from '@/composables/useResource';

const experiments = useResource(() => api.experiments.list(), {
  pollMs: (data) =>
    data?.some((item) => item.status === 'running' || item.status === 'queued') ? 5_000 : null,
});
const suites = useResource(() => api.suites.list());
const configs = useResource(() => api.configs.list());
const skills = useResource(() => api.skills.list());
const health = useHealth();

const recent = computed(() => experiments.data.value?.slice(0, 6) ?? []);
/** The three steps of using HighEval, in order, with what exists for each so far. */
const steps = computed(() => [
  {
    title: 'Configure the agents',
    detail:
      'Choose a model, then the tools, skills and memory it gets. An experiment compares two configurations.',
    links: [
      { to: '/configs', label: 'Configs', count: configs.data.value?.length },
      { to: '/skills', label: 'Skills', count: skills.data.value?.length },
    ],
  },
  {
    title: 'Write the test',
    detail:
      'A suite is a set of tasks, each with the checks that score it. Write one, or have HighEval AI draft it.',
    links: [{ to: '/suites', label: 'Suites', count: suites.data.value?.length }],
  },
  {
    title: 'Run an experiment',
    detail:
      'Both configurations take the same suite. HighEval says which did better, and how sure it can be.',
    links: [{ to: '/experiments/new', label: 'Launch experiment', count: undefined }],
  },
]);
const blockers = computed(() => {
  const checks = health.data.value?.checks;
  if (!checks) return [];
  return [
    ...(checks.hermesVersion
      ? []
      : ['Hermes is not installed. Run pnpm setup:hermes, then restart the API.']),
    ...(checks.configuredProviders.length > 0
      ? []
      : ['No provider API key is set. Add one in Settings (the samples use OpenRouter).']),
  ];
});
</script>

<template>
  <PageHeader title="Overview">
    <template #meta>
      <span
        >Compare two agent configurations on the same tasks and see whether the difference is
        real.</span
      >
    </template>
    <template #actions>
      <RouterLink to="/experiments/new" class="btn btn--primary">Launch experiment</RouterLink>
    </template>
  </PageHeader>

  <section class="how" aria-labelledby="how-heading">
    <h2 id="how-heading" class="visually-hidden">How it works</h2>
    <ol class="steps">
      <li v-for="(step, index) in steps" :key="step.title" class="step">
        <span class="step__number" aria-hidden="true">{{ index + 1 }}</span>
        <h3 class="step__title">{{ step.title }}</h3>
        <p class="muted step__detail">{{ step.detail }}</p>
        <p class="step__links">
          <RouterLink v-for="link in step.links" :key="link.to" :to="link.to"
            >{{ link.label
            }}<span v-if="link.count !== undefined" class="muted">
              ({{ link.count }})</span
            ></RouterLink
          >
        </p>
      </li>
    </ol>
  </section>

  <div class="overview">
    <section class="section" aria-labelledby="recent-heading">
      <div class="section__head">
        <h2 id="recent-heading">Recent experiments</h2>
        <RouterLink v-if="(experiments.data.value?.length ?? 0) > recent.length" to="/experiments"
          >All experiments</RouterLink
        >
      </div>
      <ErrorNotice
        v-if="experiments.error.value"
        title="Couldn't load experiments."
        :error="experiments.error.value"
        @retry="experiments.refresh"
      />
      <SkeletonRows v-else-if="!experiments.data.value" />
      <EmptyState
        v-else-if="recent.length === 0"
        :icon="PhFlask"
        title="No experiments yet."
        detail="An experiment runs every task in a suite under two configs and tells you which scores higher, and how sure you can be."
      >
        <RouterLink to="/experiments/new" class="btn btn--primary">Launch experiment</RouterLink>
      </EmptyState>
      <ExperimentTable v-else :experiments="recent" compact />
    </section>

    <aside class="overview__side">
      <section
        v-if="blockers.length"
        class="section section--alert"
        aria-labelledby="setup-heading"
      >
        <h2 id="setup-heading" class="section__head">Before you can run</h2>
        <ul class="blockers">
          <li v-for="blocker in blockers" :key="blocker">{{ blocker }}</li>
        </ul>
        <RouterLink
          v-if="health.data.value?.checks.configuredProviders.length === 0"
          to="/settings"
          class="btn btn--compact"
          >Open Settings</RouterLink
        >
      </section>

      <section class="section" aria-labelledby="method-heading">
        <h2 id="method-heading" class="section__head">How results are judged</h2>
        <p class="muted method">
          Each task is scored 0–1 by deterministic checks and, where a task calls for it, a pinned
          LLM judge. Repetitions are averaged per task, then the candidate − baseline differences
          are resampled to get a 95% interval. The candidate is called better or worse only when
          that interval excludes zero and an exact permutation test agrees, and equivalent only when
          the interval fits inside the practical margin with enough tasks to rule out hidden
          differences.
        </p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.overview {
  display: grid;
  gap: 0 var(--space-2xl);
}

@media (width >= 72rem) {
  .overview {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
}

.section--alert {
  border-top-color: var(--color-error);
}

.section--alert h2 {
  color: var(--color-error);
}

.blockers {
  margin: 0;
  padding-left: var(--space-md);
  display: grid;
  gap: var(--space-xs);
}

.how {
  margin-top: var(--space-xl);
}

/* Genuinely ordered steps, so they are numbered; hairline rules instead of cards. */
.steps {
  display: grid;
  gap: var(--space-lg);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (width >= 48rem) {
  .steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
  }

  .step + .step {
    padding-left: var(--space-lg);
    border-left: 1px solid var(--color-rule);
  }

  .step {
    padding-right: var(--space-lg);
  }
}

.step {
  display: grid;
  align-content: start;
  gap: var(--space-2xs);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-ink);
}

.step__number {
  font-family: var(--font-outlier);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: 1;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}

.step__title {
  margin: var(--space-2xs) 0 0;
  font-size: var(--text-base);
}

.step__detail {
  margin: 0;
  font-size: var(--text-sm);
  text-wrap: pretty;
}

.step__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  margin: var(--space-2xs) 0 0;
  font-size: var(--text-sm);
}

.method {
  font-size: var(--text-sm);
}
</style>
