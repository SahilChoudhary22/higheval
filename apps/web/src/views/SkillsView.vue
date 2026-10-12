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
import { useToasts } from '@/composables/useToasts';
import { useUndoableDelete } from '@/composables/useUndoableDelete';
import { formatRelative } from '@/lib/format';

const skills = useResource(() => api.skills.list());
const configs = useResource(() => api.configs.list());
const hidden = ref(new Set<string>());
const visible = computed(
  () => skills.data.value?.filter((skill) => !hidden.value.has(skill.id)) ?? [],
);
const remove = useUndoableDelete();
const { show } = useToasts();

/** Names of the agents that load a skill; a skill in use cannot be deleted. */
const usedBy = (skill: Skill): string[] =>
  configs.data.value
    ?.filter((config) => config.skillIds.includes(skill.id))
    .map((config) => config.name) ?? [];

function deleteSkill(skill: Skill): void {
  const agents = usedBy(skill);
  if (agents.length > 0) {
    show({
      tone: 'error',
      message: `“${skill.name}” is used by ${agents.join(', ')}. Remove it from ${agents.length === 1 ? 'that agent' : 'those agents'} first.`,
    });
    return;
  }
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
    <template #meta><span>Markdown instructions an agent can preload.</span></template>
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
      detail="Skills are markdown instructions an agent can load. Compare an agent with and without one to measure its effect."
    >
      <RouterLink to="/skills/new" class="btn btn--primary">New skill</RouterLink>
    </EmptyState>
    <div v-else class="table-wrap">
      <table class="table table--linked">
        <thead>
          <tr>
            <th scope="col">Skill</th>
            <th scope="col">Used by</th>
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
            <td class="wrap-anywhere">
              <span v-if="usedBy(skill).length === 0" class="muted">No agents</span>
              <template v-else>{{ usedBy(skill).join(', ') }}</template>
            </td>
            <td class="num">{{ formatRelative(skill.updatedAt) }}</td>
            <td class="num actions">
              <button
                type="button"
                class="btn btn--quiet btn--compact btn--danger"
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
