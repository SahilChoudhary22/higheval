<script setup lang="ts">
import { PhFolderOpen } from '@phosphor-icons/vue';
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
import { formatEntries, importAgentFiles, isAgentFile, parseEntries } from '@/lib/agent-files';
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
  soulMode: 'default' | 'custom';
  soul: string;
  instructions: string;
  memoryMode: 'disabled' | 'seeded';
  memoryEntries: string;
  userProfile: string;
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
  soulMode: 'default',
  soul: '',
  instructions: '',
  memoryMode: 'disabled',
  memoryEntries: '',
  userProfile: '',
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
        soulMode: config.soul === null ? 'default' : 'custom',
        soul: config.soul ?? '',
        instructions: config.instructions ?? '',
        memoryMode: config.memory.mode,
        memoryEntries: config.memory.mode === 'seeded' ? formatEntries(config.memory.entries) : '',
        userProfile:
          config.memory.mode === 'seeded' ? formatEntries(config.memory.userProfile) : '',
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

const entries = computed(() => parseEntries(form.memoryEntries));
const profileEntries = computed(() => parseEntries(form.userProfile));

const importSummary = ref<string | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/** Largest file read during import; agent files are small, so anything bigger is not one. */
const MAX_IMPORT_BYTES = 512 * 1024;

/** Fills persona, instructions and memory from a Hermes home or OpenClaw workspace, read locally. */
async function importFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const picked = [...(input.files ?? [])].filter((file) => {
    const path = file.webkitRelativePath || file.name;
    return isAgentFile(path) && file.size <= MAX_IMPORT_BYTES;
  });
  input.value = '';
  const imported = importAgentFiles(
    await Promise.all(
      picked.map(async (file) => ({
        path: file.webkitRelativePath || file.name,
        content: await file.text(),
      })),
    ),
  );
  if (imported.used.length === 0) {
    importSummary.value =
      'No agent files found. Pick a Hermes home (~/.hermes) or an OpenClaw workspace.';
    return;
  }
  if (imported.soul) Object.assign(form, { soulMode: 'custom', soul: imported.soul });
  if (imported.instructions) form.instructions = imported.instructions;
  if (imported.memory.length > 0 || imported.userProfile.length > 0) {
    Object.assign(form, {
      memoryMode: 'seeded',
      memoryEntries: formatEntries(imported.memory),
      userProfile: formatEntries(imported.userProfile),
    });
  }
  importSummary.value =
    `Imported ${imported.used.join(', ')}.` +
    (imported.unused.length > 0
      ? ` Not used by Hermes, so left out: ${imported.unused.join(', ')}.`
      : '') +
    ' Review the fields below before saving.';
}

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
        ? { mode: 'seeded', entries: entries.value, userProfile: profileEntries.value }
        : { mode: 'disabled' },
    soul: form.soulMode === 'custom' ? form.soul.trim() || null : null,
    instructions: form.instructions.trim() || null,
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
    await router.push('/agents');
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
    :title="id ? 'Edit agent' : 'New agent'"
    :crumbs="[{ label: 'Agents', to: '/agents' }, { label: id ? 'Edit' : 'New' }]"
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
          No {{ providerInfo.name }} key yet. Experiments with this agent can't launch until you
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

    <section class="agent-files" aria-labelledby="agent-files-heading">
      <div class="agent-files__head">
        <h2 id="agent-files-heading" class="agent-files__title">Agent files</h2>
        <div class="agent-files__import">
          <button type="button" class="btn btn--compact" @click="folderInput?.click()">
            <PhFolderOpen aria-hidden="true" />
            Import a folder
          </button>
          <button type="button" class="btn btn--quiet btn--compact" @click="fileInput?.click()">
            Import files
          </button>
          <input
            ref="folderInput"
            class="visually-hidden"
            type="file"
            webkitdirectory
            tabindex="-1"
            aria-hidden="true"
            @change="importFiles"
          />
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept=".md"
            multiple
            tabindex="-1"
            aria-hidden="true"
            @change="importFiles"
          />
        </div>
      </div>
      <p class="muted agent-files__intro">
        The files Hermes builds an agent's character from. Import them from a Hermes home
        (<code>~/.hermes</code>) or an OpenClaw workspace, using the same mapping as Hermes' own
        OpenClaw migration; the agent still runs on Hermes. Files are read in your browser, and only
        <code>SOUL.md</code>, <code>AGENTS.md</code>, <code>MEMORY.md</code>, <code>USER.md</code>
        and OpenClaw's daily notes are used.
      </p>
      <p v-if="importSummary" class="field__help agent-files__summary" role="status">
        {{ importSummary }}
      </p>

      <fieldset
        class="group"
        tabindex="-1"
        aria-describedby="soul-help"
        :aria-invalid="Boolean(errorFor('soul'))"
      >
        <legend class="field__label">Persona (<code>SOUL.md</code>)</legend>
        <label class="checkbox">
          <input v-model="form.soulMode" type="radio" value="default" />
          <span>Hermes' built-in persona</span>
        </label>
        <label class="checkbox">
          <input v-model="form.soulMode" type="radio" value="custom" />
          <span>Custom — who the agent is, and how it works and speaks</span>
        </label>
        <textarea
          v-if="form.soulMode === 'custom'"
          v-model="form.soul"
          class="textarea textarea--code"
          rows="6"
          placeholder="You are the account coordinator at Lakeshore Digital. You are precise, brief and never invent facts."
          aria-label="Persona (SOUL.md)"
          aria-describedby="soul-help"
          :aria-invalid="Boolean(errorFor('soul'))"
        />
        <p id="soul-help" class="field__help" :class="{ 'field__help--error': errorFor('soul') }">
          {{
            errorFor('soul') ??
            'The first thing in the system prompt. Written to SOUL.md in the run’s Hermes home.'
          }}
        </p>
      </fieldset>

      <FormField
        id="instructions"
        v-slot="field"
        label="Instructions (AGENTS.md)"
        :error="errorFor('instructions')"
        help="Optional standing instructions. Written to AGENTS.md in the working directory, where Hermes loads it as project instructions."
      >
        <textarea
          id="instructions"
          v-model="form.instructions"
          class="textarea textarea--code"
          rows="5"
          placeholder="Always state which policy rule you applied. Round money to cents."
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>

      <fieldset class="group">
        <legend class="field__label">Memory</legend>
        <label class="checkbox">
          <input v-model="form.memoryMode" type="radio" value="disabled" />
          <span>Disabled — every run starts with no memory</span>
        </label>
        <label class="checkbox">
          <input v-model="form.memoryMode" type="radio" value="seeded" />
          <span>Seeded — every run starts with these memories</span>
        </label>
        <template v-if="form.memoryMode === 'seeded'">
          <label class="field__label memory__label" for="memory-entries"
            >Agent notes (<code>MEMORY.md</code>)</label
          >
          <textarea
            id="memory-entries"
            v-model="form.memoryEntries"
            class="textarea"
            placeholder="One fact per line"
            :aria-invalid="Boolean(errorFor('memory'))"
            aria-describedby="memory-help"
          />
          <label class="field__label memory__label" for="user-profile"
            >User profile (<code>USER.md</code>)</label
          >
          <textarea
            id="user-profile"
            v-model="form.userProfile"
            class="textarea"
            placeholder="Who the agent works for, one fact per line"
            aria-describedby="memory-help"
          />
        </template>
        <p
          id="memory-help"
          class="field__help"
          :class="{ 'field__help--error': errorFor('memory') }"
        >
          {{
            errorFor('memory') ??
            (form.memoryMode === 'seeded'
              ? `${entries.length} notes, ${profileEntries.length} profile entries. One per line, or separate multi-line entries with a line holding only §, as Hermes does. Runs never write back, so both agents start the same way.`
              : '')
          }}
        </p>
      </fieldset>
    </section>

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
        placeholder="What makes this agent different, and why"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>

    <FormAlert :message="formError" :details="unclaimed(FIELDS)" />
    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="saving">
        {{ saving ? 'Saving…' : id ? 'Save agent' : 'Create agent' }}
      </button>
      <RouterLink to="/agents" class="btn btn--quiet">Cancel</RouterLink>
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

.agent-files {
  display: grid;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-ink);
}

.agent-files__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-xs);
}

.agent-files__title {
  margin: 0;
  font-size: var(--text-lg);
}

.agent-files__import {
  display: flex;
  gap: var(--space-xs);
}

.agent-files__intro,
.agent-files__summary {
  max-width: var(--prose-max);
  margin: 0;
  font-size: var(--text-sm);
}

.memory__label {
  margin-top: var(--space-xs);
}

.form__actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
