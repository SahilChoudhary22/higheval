<script setup lang="ts">
import { FlaskConical } from '@lucide/vue';
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
</script>

<template>
  <PageHeader title="Experiments">
    <template #actions>
      <RouterLink to="/experiments/new" class="btn btn--primary">Launch experiment</RouterLink>
    </template>
  </PageHeader>
  <section class="page-body">
    <ErrorNotice
      v-if="experiments.error.value"
      title="Couldn't load experiments."
      :error="experiments.error.value"
      @retry="experiments.refresh"
    />
    <SkeletonRows v-else-if="!experiments.data.value" />
    <EmptyState
      v-else-if="experiments.data.value.length === 0"
      :icon="FlaskConical"
      title="No experiments yet."
      detail="An experiment runs every task in a suite under two configs and tells you which scores higher, and how sure you can be."
    >
      <RouterLink to="/experiments/new" class="btn btn--primary">Launch experiment</RouterLink>
    </EmptyState>
    <ExperimentTable v-else :experiments="experiments.data.value" />
  </section>
</template>
