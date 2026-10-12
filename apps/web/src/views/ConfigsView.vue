<script setup lang="ts">
import { PhRobot } from '@phosphor-icons/vue';
import { PROVIDERS, type AgentConfig } from '@higheval/shared';
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/endpoints';
import EmptyState from '@/components/EmptyState.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useResource } from '@/composables/useResource';
import { useUndoableDelete } from '@/composables/useUndoableDelete';
import { bundledSkillsSummary } from '@/lib/bundled-skills';

const configs = useResource(() => api.configs.list());
const skills = useResource(() => api.skills.list());
const hidden = ref(new Set<string>());
const visible = computed(
  () => configs.data.value?.filter((config) => !hidden.value.has(config.id)) ?? [],
);
const remove = useUndoableDelete();

function skillNames(config: AgentConfig): string {
  const names = config.skillIds.map(
    (id) => skills.data.value?.find((skill) => skill.id === id)?.name ?? 'unknown',
  );
  const builtIn = bundledSkillsSummary(config.bundledSkills);
  if (builtIn) names.push(builtIn);
  return names.join(', ') || 'none';
}
const memory = (config: AgentConfig): string =>
  config.memory.mode === 'disabled' ? 'off' : `${String(config.memory.entries.length)} seeded`;

function deleteConfig(config: AgentConfig): void {
  remove({
    label: `“${config.name}”`,
    hide: () => (hidden.value = new Set([...hidden.value, config.id])),
    restore: () => (hidden.value = new Set([...hidden.value].filter((id) => id !== config.id))),
    commit: () => api.configs.remove(config.id),
  });
}
</script>

<template>
  <PageHeader title="Agents">
    <template #meta
      ><span
        >Each agent is a Hermes configuration: a model plus the tools, skills and memory it
        gets.</span
      ></template
    >
    <template #actions>
      <RouterLink to="/agents/new" class="btn btn--primary">New agent</RouterLink>
    </template>
  </PageHeader>
  <section class="page-body">
    <ErrorNotice
      v-if="configs.error.value"
      title="Couldn't load agents."
      :error="configs.error.value"
      @retry="configs.refresh"
    />
    <SkeletonRows v-else-if="!configs.data.value" />
    <EmptyState
      v-else-if="visible.length === 0"
      :icon="PhRobot"
      title="No agents yet."
      detail="An experiment compares two agents, so you need at least two."
    >
      <RouterLink to="/agents/new" class="btn btn--primary">New agent</RouterLink>
    </EmptyState>
    <div v-else class="table-wrap">
      <table class="table table--linked">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">Model</th>
            <th scope="col">Tools</th>
            <th scope="col">Skills</th>
            <th scope="col">Memory</th>
            <th scope="col" class="num">Turns</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="config in visible" :key="config.id">
            <td class="wrap-anywhere">
              <RouterLink :to="`/agents/${config.id}/edit`" class="row-link">{{
                config.name
              }}</RouterLink>
            </td>
            <td class="wrap-anywhere">
              <span class="mono">{{ config.model.model }}</span>
              <span class="muted model-provider">{{ PROVIDERS[config.model.provider].name }}</span>
            </td>
            <td class="mono">{{ config.toolsets.join(', ') || 'none' }}</td>
            <td
              class="mono wrap-anywhere"
              :title="
                config.bundledSkills.mode === 'selected'
                  ? `Built-in: ${config.bundledSkills.names.join(', ')}`
                  : undefined
              "
            >
              {{ skillNames(config) }}
            </td>
            <td>{{ memory(config) }}</td>
            <td class="num">{{ config.maxTurns }}</td>
            <td class="num actions">
              <button
                type="button"
                class="btn btn--quiet btn--compact btn--danger"
                @click="deleteConfig(config)"
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
.model-provider {
  display: block;
  font-size: var(--text-sm);
}

.actions .btn {
  position: relative;
  z-index: var(--z-raised);
}
</style>
