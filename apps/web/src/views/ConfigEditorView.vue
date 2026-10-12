<script setup lang="ts">
import {
  agentConfigInputSchema,
  toolsetSchema,
  type AgentConfigInput,
  type BundledSkills,
  type Toolset,
} from '@higheval/shared';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useFormErrors } from '@/composables/useFormErrors';
import { useResource } from '@/composables/useResource';
import { groupByCategory, platformLabel } from '@/lib/bundled-skills';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const skills = useResource(() => api.skills.list());
const catalog = useResource(() => api.hermes.skills());
const { errors, formError, validate, fromError, clear } = useFormErrors();

const TOOLSET_HELP: Record<Toolset, string> = {
  file: 'Read, write, patch and search files in the task workspace.',
  terminal: 'Run shell commands in the workspace (not sandboxed; dangerous commands are denied).',
  todo: 'Keep a task list while working.',
  skills: 'List and open the available skills on demand.',
};
const SUGGESTED_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'cohere/north-mini-code:free',
];

interface ConfigForm {
  name: string;
  description: string;
  model: string;
  toolsets: Toolset[];
  skillIds: string[];
  bundledMode: BundledSkills['mode'];
  bundledNames: string[];
  memoryMode: 'disabled' | 'seeded';
  memoryEntries: string;
  maxTurns: number;
  timeoutSeconds: number;
}

const form = reactive<ConfigForm>({
  name: '',
  description: '',
  model: '',
  toolsets: ['file'],
  skillIds: [],
  bundledMode: 'none',
  bundledNames: [],
  memoryMode: 'disabled',
  memoryEntries: '',
  maxTurns: 12,
  timeoutSeconds: 240,
});
const loading = ref(Boolean(props.id));
const saving = ref(false);

watch(
  () => props.id,
  async (id) => {
    if (!id) return;
    loading.value = true;
    try {
      const config = await api.configs.get(id);
      Object.assign(form, {
        name: config.name,
        description: config.description,
        model: config.model.model,
        toolsets: [...config.toolsets],
        skillIds: [...config.skillIds],
        bundledMode: config.bundledSkills.mode,
        bundledNames:
          config.bundledSkills.mode === 'selected' ? [...config.bundledSkills.names] : [],
        memoryMode: config.memory.mode,
        memoryEntries: config.memory.mode === 'seeded' ? config.memory.entries.join('\n') : '',
        maxTurns: config.maxTurns,
        timeoutSeconds: config.timeoutSeconds,
      });
    } catch (error) {
      fromError(error);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const bundledQuery = ref('');
const bundledCatalog = computed(() =>
  catalog.data.value?.status === 'available' ? catalog.data.value.skills : [],
);
const bundledGroups = computed(() => groupByCategory(bundledCatalog.value, bundledQuery.value));
const usesBundledSkills = computed(() => form.bundledMode !== 'none');
const bundledError = computed(
  () => Object.entries(errors.value).find(([path]) => path.startsWith('bundledSkills'))?.[1],
);
const bundledSkills = computed((): BundledSkills =>
  form.bundledMode === 'selected'
    ? { mode: 'selected', names: form.bundledNames }
    : { mode: form.bundledMode },
);

const bundledHelp = computed((): string => {
  if (!usesBundledSkills.value) {
    return 'Off: runs get none of the skills a normal Hermes install ships with.';
  }
  const count = form.bundledMode === 'all' ? bundledCatalog.value.length : form.bundledNames.length;
  return `${String(count)} selected. Copied into every run and listed in its skills index; the agent opens them on demand with the skills tools. OS-limited skills do not load on other systems.`;
});

const entries = computed(() =>
  form.memoryEntries
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
);

async function save(): Promise<void> {
  clear();
  const input: AgentConfigInput = {
    name: form.name.trim(),
    description: form.description.trim(),
    model: { provider: 'openrouter', model: form.model.trim() },
    toolsets: form.toolsets,
    skillIds: form.skillIds,
    bundledSkills: bundledSkills.value,
    memory:
      form.memoryMode === 'seeded'
        ? { mode: 'seeded', entries: entries.value }
        : { mode: 'disabled' },
    maxTurns: form.maxTurns,
    timeoutSeconds: form.timeoutSeconds,
  };
  if (!validate(agentConfigInputSchema, input)) return;
  saving.value = true;
  try {
    if (props.id) await api.configs.update(props.id, input);
    else await api.configs.create(input);
    await router.push('/configs');
  } catch (error) {
    fromError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageHeader
    :title="id ? 'Edit config' : 'New config'"
    :crumbs="[{ label: 'Configs', to: '/configs' }, { label: id ? 'Edit' : 'New' }]"
  >
    <template #meta>
      <span>Changes apply to future experiments. Launched experiments keep a hashed snapshot.</span>
    </template>
  </PageHeader>

  <SkeletonRows v-if="loading" :rows="8" />
  <form v-else class="form" novalidate @submit.prevent="save">
    <div class="field">
      <label class="field__label" for="name">Name</label>
      <input
        id="name"
        v-model="form.name"
        class="input"
        placeholder="Model · tools · skills"
        :aria-invalid="Boolean(errors.name)"
      />
      <p class="field__help" :class="{ 'field__help--error': errors.name }">
        {{ errors.name ?? '' }}
      </p>
    </div>

    <div class="field">
      <label class="field__label" for="model">Model</label>
      <input
        id="model"
        v-model="form.model"
        class="input mono"
        list="model-suggestions"
        placeholder="vendor/model-id"
        spellcheck="false"
        :aria-invalid="Boolean(errors['model.model'])"
      />
      <datalist id="model-suggestions">
        <option v-for="model in SUGGESTED_MODELS" :key="model" :value="model" />
      </datalist>
      <p class="field__help" :class="{ 'field__help--error': errors['model.model'] }">
        {{
          errors['model.model'] ??
          'Exact OpenRouter model ID. Router aliases are not allowed, so results stay attributable.'
        }}
      </p>
    </div>

    <fieldset class="group">
      <legend class="field__label">Tools</legend>
      <label
        v-for="toolset in toolsetSchema.options"
        :key="toolset"
        class="checkbox checkbox--described"
      >
        <input v-if="toolset === 'skills' && usesBundledSkills" type="checkbox" checked disabled />
        <input v-else v-model="form.toolsets" type="checkbox" :value="toolset" />
        <span>
          <span class="mono">{{ toolset }}</span>
          <span class="muted option-help">{{
            toolset === 'skills' && usesBundledSkills
              ? 'On automatically: the agent finds built-in skills through it.'
              : TOOLSET_HELP[toolset]
          }}</span>
        </span>
      </label>
      <p class="field__help">
        {{
          form.toolsets.length === 0 && !usesBundledSkills
            ? 'No tools: the agent can only reply in text.'
            : ''
        }}
      </p>
    </fieldset>

    <fieldset class="group">
      <legend class="field__label">Skills</legend>
      <p v-if="skills.data.value?.length === 0" class="muted">
        No skills yet. <RouterLink to="/skills/new">Create a skill</RouterLink> to preload
        instructions.
      </p>
      <label
        v-for="skill in skills.data.value"
        :key="skill.id"
        class="checkbox checkbox--described"
      >
        <input v-model="form.skillIds" type="checkbox" :value="skill.id" />
        <span>
          <span class="mono">{{ skill.name }}</span>
          <span class="muted option-help">{{ skill.description }}</span>
        </span>
      </label>
      <p class="field__help">Selected skills are preloaded into the agent's context in full.</p>
    </fieldset>

    <fieldset class="group">
      <legend class="field__label">Hermes built-in skills</legend>
      <p v-if="catalog.data.value?.status === 'unavailable'" class="muted">
        {{ catalog.data.value.message }} Until then, built-in skills can't be selected.
      </p>
      <p v-else-if="catalog.error.value" class="muted">
        Couldn't load Hermes' built-in skills.
        <button type="button" class="btn btn--quiet btn--compact" @click="catalog.refresh">
          Retry
        </button>
      </p>
      <label class="checkbox">
        <input v-model="form.bundledMode" type="radio" value="none" />
        <span>None — only the skills selected above</span>
      </label>
      <label class="checkbox">
        <input
          v-model="form.bundledMode"
          type="radio"
          value="all"
          :disabled="bundledCatalog.length === 0"
        />
        <span>All ({{ bundledCatalog.length }})</span>
      </label>
      <label class="checkbox">
        <input
          v-model="form.bundledMode"
          type="radio"
          value="selected"
          :disabled="bundledCatalog.length === 0"
        />
        <span>Selected</span>
      </label>
      <div v-if="form.bundledMode === 'selected'" class="bundled">
        <input
          v-model="bundledQuery"
          class="input"
          type="search"
          placeholder="Search by name, category or description"
          aria-label="Search built-in skills"
        />
        <div class="bundled__list">
          <fieldset v-for="group in bundledGroups" :key="group.category" class="bundled__group">
            <legend class="label">{{ group.category }}</legend>
            <label
              v-for="skill in group.skills"
              :key="skill.name"
              class="checkbox checkbox--described"
            >
              <input v-model="form.bundledNames" type="checkbox" :value="skill.name" />
              <span>
                <span class="mono">{{ skill.name }}</span>
                <span v-if="platformLabel(skill.platforms)" class="platform">{{
                  platformLabel(skill.platforms)
                }}</span>
                <span class="muted option-help">{{ skill.description }}</span>
              </span>
            </label>
          </fieldset>
          <p v-if="bundledGroups.length === 0" class="muted">
            No built-in skills match “{{ bundledQuery.trim() }}”.
          </p>
        </div>
      </div>
      <p class="field__help" :class="{ 'field__help--error': bundledError }">
        {{ bundledError ?? bundledHelp }}
      </p>
    </fieldset>

    <fieldset class="group">
      <legend class="field__label">Memory</legend>
      <label class="checkbox">
        <input v-model="form.memoryMode" type="radio" value="disabled" />
        <span>Disabled — every run starts with no memory</span>
      </label>
      <label class="checkbox">
        <input v-model="form.memoryMode" type="radio" value="seeded" />
        <span>Seeded — every run starts with these entries</span>
      </label>
      <textarea
        v-if="form.memoryMode === 'seeded'"
        v-model="form.memoryEntries"
        class="textarea"
        placeholder="One fact per line"
        :aria-invalid="Boolean(errors['memory.entries'])"
        aria-label="Memory entries"
      />
      <p class="field__help" :class="{ 'field__help--error': errors['memory.entries'] }">
        {{
          errors['memory.entries'] ??
          (form.memoryMode === 'seeded'
            ? `${entries.length} entries. Runs never write back, so arms stay comparable.`
            : '')
        }}
      </p>
    </fieldset>

    <div class="form__pair">
      <div class="field">
        <label class="field__label" for="turns">Max turns</label>
        <input
          id="turns"
          v-model.number="form.maxTurns"
          class="input"
          type="number"
          min="1"
          max="100"
          :aria-invalid="Boolean(errors.maxTurns)"
        />
        <p class="field__help" :class="{ 'field__help--error': errors.maxTurns }">
          {{ errors.maxTurns ?? 'Tool-calling iterations before the agent must stop.' }}
        </p>
      </div>
      <div class="field">
        <label class="field__label" for="timeout">Timeout (seconds)</label>
        <input
          id="timeout"
          v-model.number="form.timeoutSeconds"
          class="input"
          type="number"
          min="10"
          max="1800"
          :aria-invalid="Boolean(errors.timeoutSeconds)"
        />
        <p class="field__help" :class="{ 'field__help--error': errors.timeoutSeconds }">
          {{ errors.timeoutSeconds ?? 'Wall-clock limit per run.' }}
        </p>
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="description">Description</label>
      <textarea
        id="description"
        v-model="form.description"
        class="textarea"
        placeholder="What changes in this config, and why"
      />
      <p class="field__help" />
    </div>

    <p v-if="formError" class="field__help field__help--error" role="alert">{{ formError }}</p>
    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="saving">
        {{ saving ? 'Saving…' : id ? 'Save config' : 'Create config' }}
      </button>
      <RouterLink to="/configs" class="btn btn--quiet">Cancel</RouterLink>
    </div>
  </form>
</template>

<style scoped>
.form {
  margin-top: var(--space-xl);
  display: grid;
  gap: var(--space-sm);
  max-width: var(--form-max);
}

.group {
  display: grid;
  gap: var(--space-2xs);
  margin: 0;
  padding: 0;
  border: 0;
}

.group legend {
  margin-bottom: var(--space-2xs);
}

.checkbox--described {
  align-items: flex-start;
  padding: var(--space-2xs) 0;
}

.checkbox--described input {
  margin-top: var(--space-3xs);
}

.option-help {
  display: block;
  font-size: var(--text-sm);
}

.bundled {
  display: grid;
  gap: var(--space-xs);
}

.bundled__list {
  max-height: 28rem;
  overflow-y: auto;
  padding: 0 var(--space-sm);
  border: 1px solid var(--color-rule);
  background: var(--color-surface);
}

.bundled__group {
  margin: 0;
  padding: var(--space-xs) 0;
  border: 0;
  border-bottom: 1px solid var(--color-rule);
}

.bundled__group:last-child {
  border-bottom: 0;
}

.bundled__group legend {
  padding: var(--space-2xs) 0 0;
}

.platform {
  margin-left: var(--space-xs);
  padding: 0 var(--space-2xs);
  border-radius: var(--radius-tag);
  background: var(--color-paper-2);
  color: var(--color-ink-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.form__pair {
  display: grid;
  gap: var(--space-sm) var(--space-lg);
}

@media (width >= 40rem) {
  .form__pair {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.form__actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
