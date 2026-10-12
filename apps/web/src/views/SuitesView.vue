<script setup lang="ts">
import { ListChecks } from '@lucide/vue';
import type { SuiteSummary } from '@higheval/shared';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/endpoints';
import EmptyState from '@/components/EmptyState.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useResource } from '@/composables/useResource';
import { useUndoableDelete } from '@/composables/useUndoableDelete';
import { formatRelative } from '@/lib/format';

const suites = useResource(() => api.suites.list());
const hidden = ref(new Set<string>());
const visible = computed(
  () => suites.data.value?.filter((suite) => !hidden.value.has(suite.id)) ?? [],
);
const remove = useUndoableDelete();

function deleteSuite(suite: SuiteSummary): void {
  remove({
    label: `“${suite.name}”`,
    hide: () => (hidden.value = new Set([...hidden.value, suite.id])),
    restore: () => (hidden.value = new Set([...hidden.value].filter((id) => id !== suite.id))),
    commit: () => api.suites.remove(suite.id),
  });
}
</script>

<template>
  <PageHeader title="Suites">
    <template #meta><span>Sets of tasks, each with the checks that score it.</span></template>
    <template #actions>
      <RouterLink to="/suites/new" class="btn btn--primary">New suite</RouterLink>
    </template>
  </PageHeader>
  <section class="page-body">
    <ErrorNotice
      v-if="suites.error.value"
      title="Couldn't load suites."
      :error="suites.error.value"
      @retry="suites.refresh"
    />
    <SkeletonRows v-else-if="!suites.data.value" />
    <EmptyState
      v-else-if="visible.length === 0"
      :icon="ListChecks"
      title="No suites yet."
      detail="A suite is the fixed set of tasks both configs are measured on. Each task defines its own scorers."
    >
      <RouterLink to="/suites/new" class="btn btn--primary">New suite</RouterLink>
    </EmptyState>
    <div v-else class="table-wrap">
      <table class="table table--linked">
        <thead>
          <tr>
            <th scope="col">Suite</th>
            <th scope="col" class="num">Tasks</th>
            <th scope="col" class="num">Updated</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="suite in visible" :key="suite.id">
            <td class="wrap-anywhere">
              <RouterLink :to="`/suites/${suite.id}`" class="row-link">{{ suite.name }}</RouterLink>
              <span class="sub muted">{{ suite.description }}</span>
            </td>
            <td class="num">{{ suite.taskCount }}</td>
            <td class="num">{{ formatRelative(suite.updatedAt) }}</td>
            <td class="num actions">
              <button
                type="button"
                class="btn btn--quiet btn--compact btn--danger"
                @click="deleteSuite(suite)"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.sub {
  display: block;
  max-width: var(--prose-max);
  font-size: var(--text-sm);
}

/* Keep row actions above the stretched row link. */
.actions .btn {
  position: relative;
  z-index: var(--z-raised);
}
</style>
