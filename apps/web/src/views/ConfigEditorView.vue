<script setup lang="ts">
import {
  agentConfigInputSchema,
  PROVIDER_IDS,
  PROVIDERS,
  toolsetSchema,
  type ProviderId,
  type AgentConfigInput,
  type BundledSkills,
  type Toolset,
} from '@higheval/shared';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useFormErrors } from '@/composables/useFormErrors';
import { useResource } from '@/composables/useResource';
import { groupByCategory, platformLabel } from '@/lib/bundled-skills';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const skills = useResource(() => api.skills.list());
const catalog = useResource(() => api.hermes.skills());
const providers = useResource(() => api.providers.list());
const { formError, validate, fromError, errorFor, unclaimed, focusFirstInvalid, clear } =
  useFormErrors();
/** Every input path with a place to show its error; anything else is listed in the alert. */
const FIELDS = [
  'name',
  'model.provider',
  'model.model',
  'toolsets',
  'skillIds',
  'bundledSkills',
  'memory',
  'maxTurns',
  'timeoutSeconds',
  'description',
] as const;
const formEl = ref<HTMLFormElement | null>(null);

const TOOLSET_HELP: Record<Toolset, string> = {
  file: 'Read, write, patch and search files in the task workspace.',
  terminal: 'Run shell commands in the workspace (not sandboxed; dangerous commands are denied).',
  todo: 'Keep a task list while working.',
  skills: 'List and open the available skills on demand.',
};
/**
 * OpenRouter models offered as suggestions: the free ones the samples use, and
 * low-cost paid ones. Prices are OpenRouter's lowest, per million input/output tokens.
 */
const SUGGESTED_MODELS: { id: string; note: string }[] = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', note: 'Free' },
  { id: 'nvidia/nemotron-3.5-lightning:free', note: 'Free' },
  { id: 'cohere/north-mini-code:free', note: 'Free' },
  { id: 'deepseek/deepseek-v4.1-flash', note: '$0.15 / $0.60' },
  { id: 'mistralai/mistral-nemo', note: '$0.03 / $0.03' },
  { id: 'mistralai/mistral-small-24b-instruct-2501', note: '$0.05 / $0.08 · no tool calling' },
];

interface ConfigForm {
  name: string;
  description: string;
  provider: ProviderId;
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
  provider: 'openrouter',
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
        provider: config.model.provider,
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

const providerInfo = computed(() => PROVIDERS[form.provider]);
const modelHelp = computed(
  () =>
    `Exact ${providerInfo.value.name} model ID. Router aliases are not allowed, so results stay attributable.` +
    (form.provider === 'openrouter'
      ? ' Runs use the cheapest provider OpenRouter offers for the model.'
      : ''),
);
/** False only once we know the selected provider has no key; unknown counts as fine. */
const providerReady = computed(
  () => providers.data.value?.find((provider) => provider.id === form.provider)?.configured ?? true,
);

const bundledQuery = ref('');
const bundledCatalog = computed(() =>
  catalog.data.value?.status === 'available' ? catalog.data.value.skills : [],
);
const bundledGroups = computed(() => groupByCategory(bundledCatalog.value, bundledQuery.value));
const usesBundledSkills = computed(() => form.bundledMode !== 'none');
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
    model: { provider: form.provider, model: form.model.trim() },
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
  if (!validate(agentConfigInputSchema, input)) {
    await focusFirstInvalid(formEl.value);
    return;
  }
  saving.value = true;
  try {
    if (props.id) await api.configs.update(props.id, input);
    else await api.configs.create(input);
    await router.push('/configs');
  } catch (error) {
    fromError(error);
    await focusFirstInvalid(formEl.value);
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
  <form v-else ref="formEl" class="form" novalidate @submit.prevent="save">
    <FormField id="name" v-slot="field" label="Name" :error="errorFor('name')">
      <input
        id="name"
        v-model="form.name"
        class="input"
        placeholder="Model · tools · skills"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>

    <FormField id="provider" label="Provider" :error="errorFor('model.provider')">
      <template #default="field">
        <select
          id="provider"
          v-model="form.provider"
          class="select"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        >
          <option v-for="providerId in PROVIDER_IDS" :key="providerId" :value="providerId">
            {{ PROVIDERS[providerId].name }}
          </option>
        </select>
      </template>
      <template #help>
        <template v-if="!providerReady">
          No {{ providerInfo.name }} key yet. Experiments with this config can't launch until you
          <RouterLink to="/settings">add one in Settings</RouterLink>.
        </template>
        <template v-else>Runs use this provider's key from Settings or .env.</template>
      </template>
    </FormField>

    <FormField
      id="model"
      v-slot="field"
      label="Model"
      :error="errorFor('model.model')"
      :help="modelHelp"
    >
      <input
        id="model"
        v-model="form.model"
        class="input mono"
        :list="form.provider === 'openrouter' ? 'model-suggestions' : undefined"
        :placeholder="providerInfo.modelExample"
        spellcheck="false"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
      <datalist id="model-suggestions">
        <option v-for="model in SUGGESTED_MODELS" :key="model.id" :value="model.id">
          {{ model.note }}
        </option>
      </datalist>
    </FormField>

    <fieldset
      class="group"
      tabindex="-1"
      aria-describedby="toolsets-help"
      :aria-invalid="Boolean(errorFor('toolsets'))"
    >
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
      <p
        id="toolsets-help"
        class="field__help"
        :class="{ 'field__help--error': errorFor('toolsets') }"
      >
        {{
          errorFor('toolsets') ??
          (form.toolsets.length === 0 && !usesBundledSkills
            ? 'No tools: the agent can only reply in text.'
            : '')
        }}
      </p>
    </fieldset>

    <fieldset
      class="group"
      tabindex="-1"
      aria-describedby="skills-help"
      :aria-invalid="Boolean(errorFor('skillIds'))"
    >
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
      <p
        id="skills-help"
        class="field__help"
        :class="{ 'field__help--error': errorFor('skillIds') }"
      >
        {{
          errorFor('skillIds') ?? "Selected skills are preloaded into the agent's context in full."
        }}
      </p>
    </fieldset>

    <fieldset
      class="group"
      tabindex="-1"
      aria-describedby="bundled-help"
      :aria-invalid="Boolean(errorFor('bundledSkills'))"
    >
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
      <p
        id="bundled-help"
        class="field__help"
        :class="{ 'field__help--error': errorFor('bundledSkills') }"
      >
        {{ errorFor('bundledSkills') ?? bundledHelp }}
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
        :aria-invalid="Boolean(errorFor('memory'))"
        aria-label="Memory entries"
        aria-describedby="memory-help"
      />
      <p id="memory-help" class="field__help" :class="{ 'field__help--error': errorFor('memory') }">
        {{
          errorFor('memory') ??
          (form.memoryMode === 'seeded'
            ? `${entries.length} entries. Runs never write back, so arms stay comparable.`
            : '')
        }}
      </p>
    </fieldset>

    <div class="form__pair">
      <FormField
        id="turns"
        v-slot="field"
        label="Max turns"
        :error="errorFor('maxTurns')"
        help="Tool-calling iterations before the agent must stop."
      >
        <input
          id="turns"
          v-model.number="form.maxTurns"
          class="input"
          type="number"
          min="1"
          max="100"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        id="timeout"
        v-slot="field"
        label="Timeout (seconds)"
        :error="errorFor('timeoutSeconds')"
        help="Wall-clock limit per run."
      >
        <input
          id="timeout"
          v-model.number="form.timeoutSeconds"
          class="input"
          type="number"
          min="10"
          max="1800"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
    </div>

    <FormField id="description" v-slot="field" label="Description" :error="errorFor('description')">
      <textarea
        id="description"
        v-model="form.description"
        class="textarea"
        placeholder="What changes in this config, and why"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>

    <FormAlert :message="formError" :details="unclaimed(FIELDS)" />
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
