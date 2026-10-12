<script setup lang="ts">
import { FlaskConical } from '@lucide/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/endpoints';
import EmptyState from '@/components/EmptyState.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import ExperimentTable from '@/components/ExperimentTable.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useResource } from '@/composables/useResource';

const experiments = useResource(() => api.experiments.list(), {
  pollMs: (data) =>
    data?.some((item) => item.status === 'running' || item.status === 'queued') ? 5_000 : null,
});
const suites = useResource(() => api.suites.list());
const configs = useResource(() => api.configs.list());
const skills = useResource(() => api.skills.list());
const health = useResource(() => api.health());

const recent = computed(() => experiments.data.value?.slice(0, 6) ?? []);
const library = computed(() => [
  {
    label: 'Suites',
    to: '/suites',
    count: suites.data.value?.length,
    detail: 'tasks and how each is scored',
  },
  {
    label: 'Configs',
    to: '/configs',
    count: configs.data.value?.length,
    detail: 'model, skills, memory, tools',
  },
  {
    label: 'Skills',
    to: '/skills',
    count: skills.data.value?.length,
    detail: 'instructions a config can load',
  },
]);
const blockers = computed(() => {
  const checks = health.data.value?.checks;
  if (!checks) return [];
  return [
    ...(checks.hermesVersion
      ? []
      : ['Hermes is not installed. Run pnpm setup:hermes, then restart the API.']),
    ...(checks.providerKey
      ? []
      : ['OPENROUTER_API_KEY is missing. Add it to .env, then restart the API.']),
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
        :icon="FlaskConical"
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
      </section>

      <section class="section" aria-labelledby="library-heading">
        <h2 id="library-heading" class="section__head">Library</h2>
        <dl class="library">
          <div v-for="item in library" :key="item.label" class="library__row">
            <dt>
              <RouterLink :to="item.to">{{ item.label }}</RouterLink>
              <span class="muted library__detail">{{ item.detail }}</span>
            </dt>
            <dd>{{ item.count ?? '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="section" aria-labelledby="method-heading">
        <h2 id="method-heading" class="section__head">How results are judged</h2>
        <p class="muted method">
          Each task is scored 0–1 by deterministic checks. Repetitions are averaged per task, then
          the candidate − baseline differences are resampled to get a 95% interval. The candidate is
          called better or worse only when that interval excludes zero and an exact permutation test
          agrees, and equivalent only when the interval fits inside the practical margin with enough
          tasks to rule out hidden differences.
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

.library {
  margin: 0;
}

.library__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-md);
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--color-rule);
}

.library__row dt {
  display: grid;
  font-weight: 600;
}

.library__detail {
  font-size: var(--text-sm);
  font-weight: var(--weight-body);
}

.library__row dd {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.method {
  font-size: var(--text-sm);
}
</style>
