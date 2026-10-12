<script setup lang="ts">
import { PhBookOpen } from '@phosphor-icons/vue';
import type { Skill } from '@higheval/shared';
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

const skills = useResource(() => api.skills.list());
const configs = useResource(() => api.configs.list());
const hidden = ref(new Set<string>());
const visible = computed(
  () => skills.data.value?.filter((skill) => !hidden.value.has(skill.id)) ?? [],
);
const remove = useUndoableDelete();

const usedBy = (skill: Skill): number =>
  configs.data.value?.filter((config) => config.skillIds.includes(skill.id)).length ?? 0;

function deleteSkill(skill: Skill): void {
  remove({
    label: `“${skill.name}”`,
    hide: () => (hidden.value = new Set([...hidden.value, skill.id])),
    restore: () => (hidden.value = new Set([...hidden.value].filter((id) => id !== skill.id))),
    commit: () => api.skills.remove(skill.id),
  });
}
</script>

<template>
  <PageHeader title="Skills">
    <template #meta
      ><span>Markdown instructions a config can preload into the agent.</span></template
    >
    <template #actions>
      <RouterLink to="/skills/new" class="btn btn--primary">New skill</RouterLink>
    </template>
  </PageHeader>
  <section class="page-body">
    <ErrorNotice
      v-if="skills.error.value"
      title="Couldn't load skills."
      :error="skills.error.value"
      @retry="skills.refresh"
    />
    <SkeletonRows v-else-if="!skills.data.value" />
    <EmptyState
      v-else-if="visible.length === 0"
      :icon="PhBookOpen"
      title="No skills yet."
      detail="Skills are markdown instructions an agent config can load. Compare a config with and without one to measure its effect."
    >
      <RouterLink to="/skills/new" class="btn btn--primary">New skill</RouterLink>
    </EmptyState>
    <div v-else class="table-wrap">
      <table class="table table--linked">
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col" class="num">Used by</th>
            <th scope="col" class="num">Updated</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="skill in visible" :key="skill.id">
            <td class="wrap-anywhere">
              <RouterLink :to="`/skills/${skill.id}/edit`" class="row-link mono">{{
                skill.name
              }}</RouterLink>
              <span class="sub muted">{{ skill.description }}</span>
            </td>
            <td class="num">
              {{ usedBy(skill) }} {{ usedBy(skill) === 1 ? 'config' : 'configs' }}
            </td>
            <td class="num">{{ formatRelative(skill.updatedAt) }}</td>
            <td class="num actions">
              <button
                type="button"
                class="btn btn--quiet btn--compact btn--danger"
                :disabled="usedBy(skill) > 0"
                :title="usedBy(skill) > 0 ? 'Remove it from every config first' : undefined"
                @click="deleteSkill(skill)"
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

.actions .btn {
  position: relative;
  z-index: var(--z-raised);
}
</style>
