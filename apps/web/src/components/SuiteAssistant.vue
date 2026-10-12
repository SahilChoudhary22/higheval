<script setup lang="ts">
import {
  suiteDraftRequestSchema,
  type SuiteDraft,
  type SuiteDraftRequest,
  type SuiteInput,
} from '@higheval/shared';
import { PhChatCenteredText, PhCheck, PhCircleNotch, PhWarning } from '@phosphor-icons/vue';
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue';
import { api } from '@/api/endpoints';
import { useFormErrors } from '@/composables/useFormErrors';
import { formatDuration } from '@/lib/format';
import { suiteChanges } from '@/lib/suite-changes';
import CodeBlock from './CodeBlock.vue';
import FormAlert from './FormAlert.vue';
import FormField from './FormField.vue';

const props = defineProps<{
  /** The suite in the editor, when it is valid; offered for revision. */
  current?: SuiteInput | undefined;
  /** Start in revision mode (editing an existing suite). */
  revising?: boolean;
  /** Focus the description on mount, e.g. when opened from "Draft with HighEval AI". */
  focus?: boolean;
}>();
const emit = defineEmits<{ drafted: [suite: SuiteInput] }>();

const POLL_MS = 2_000;

const description = ref('');
const revise = ref(props.revising);
// Replaced wholesale on every poll, so a shallow ref is enough.
const draft = shallowRef<SuiteDraft | null>(null);
const busy = ref(false);
const now = ref(Date.now());
const { formError, validate, fromError, errorFor, clear } = useFormErrors();
const input = ref<HTMLTextAreaElement | null>(null);

onMounted(() => {
  if (props.focus) input.value?.focus();
});

let poll: ReturnType<typeof setTimeout> | undefined;
const clock = setInterval(() => (now.value = Date.now()), 1_000);
onScopeDispose(() => {
  clearTimeout(poll);
  clearInterval(clock);
});

const running = computed(() => draft.value?.status === 'running');
const elapsed = computed(() => {
  if (!draft.value) return '';
  const end = draft.value.finishedAt ? Date.parse(draft.value.finishedAt) : now.value;
  return formatDuration(end - Date.parse(draft.value.createdAt));
});
const passedChecks = computed(
  () => draft.value?.checks.filter((check) => check.passed).length ?? 0,
);
const failedChecks = computed(() => draft.value?.checks.filter((check) => !check.passed) ?? []);

async function refresh(id: string): Promise<void> {
  try {
    draft.value = await api.suiteDrafts.get(id);
  } catch (error) {
    fromError(error);
    return;
  }
  if (draft.value.status === 'running') poll = setTimeout(() => void refresh(id), POLL_MS);
}

/** Whether a draft has been applied, after which it can be revised in turn. */
const drafted = ref(false);
/** The draft last applied to the editor, so its button turns into a confirmation. */
const appliedId = ref<string | null>(null);

const draftJson = computed(() =>
  draft.value?.suite ? JSON.stringify(draft.value.suite, null, 2) : '',
);

/** What applying the draft would change, compared with the editor as it is now. */
const changeSummary = computed(() => {
  const suite = draft.value?.suite;
  if (!suite) return '';
  if (!props.current) return "Replaces the editor's content, which isn't a valid suite right now.";
  const changes = suiteChanges(props.current, suite);
  const parts = [
    changes.added.length ? `adds ${changes.added.join(', ')}` : '',
    changes.changed.length ? `changes ${changes.changed.join(', ')}` : '',
    changes.removed.length ? `removes ${changes.removed.join(', ')}` : '',
    changes.detailsChanged ? 'updates the name or description' : '',
  ].filter(Boolean);
  if (parts.length === 0) return 'Identical to the suite in the editor.';
  const kept = changes.unchanged ? `; ${String(changes.unchanged)} unchanged` : '';
  return `Compared with the editor, this draft ${parts.join(', ')}${kept}.`;
});

/** A finished draft waiting to be applied takes the primary action from the form. */
const awaitingApply = computed(
  () => draft.value?.status === 'ready' && appliedId.value !== draft.value.id,
);

/** Hands the draft to the editor; follow-up requests then revise it. */
function apply(): void {
  if (!draft.value?.suite) return;
  emit('drafted', draft.value.suite);
  appliedId.value = draft.value.id;
  drafted.value = true;
  revise.value = true;
  description.value = '';
}

async function start(): Promise<void> {
  clear();
  const request: SuiteDraftRequest = {
    description: description.value,
    ...(revise.value && props.current ? { suite: props.current } : {}),
  };
  if (!validate(suiteDraftRequestSchema, request)) {
    input.value?.focus();
    return;
  }
  busy.value = true;
  try {
    draft.value = await api.suiteDrafts.start(request);
    poll = setTimeout(() => void refresh(draft.value?.id ?? ''), POLL_MS);
  } catch (error) {
    fromError(error);
    input.value?.focus();
  } finally {
    busy.value = false;
  }
}

async function cancel(): Promise<void> {
  if (!draft.value) return;
  clearTimeout(poll);
  try {
    draft.value = await api.suiteDrafts.cancel(draft.value.id);
  } catch (error) {
    fromError(error);
  }
}
</script>

<template>
  <section class="assistant" aria-labelledby="assistant-heading">
    <h2 id="assistant-heading" class="assistant__title">
      <PhChatCenteredText aria-hidden="true" />
      Draft with HighEval AI
    </h2>
    <p class="muted assistant__intro">
      Describe what the suite should test. HighEval AI, a Hermes agent, writes the tasks, fixture
      files and scorers, computes expected values with a script, and HighEval checks the result
      against the suite schema and the agent's own reference answers. You review the draft here,
      then apply it to the editor below or copy it; nothing is saved until you save it.
    </p>

    <form class="assistant__form" novalidate @submit.prevent="start">
      <FormField
        id="draft-description"
        v-slot="field"
        :label="revise ? 'What should change?' : 'What should the suite test?'"
        :error="errorFor('description')"
        help="Name the domain, how many tasks, the edge cases that matter and what a correct answer looks like."
      >
        <textarea
          id="draft-description"
          ref="input"
          v-model="description"
          class="textarea"
          rows="4"
          :disabled="running"
          :placeholder="
            revise
              ? 'Add two tasks about partial refunds, and make the SMS task reject messages over 160 characters.'
              : 'Five tasks for a dental clinic front desk: find double-booked appointments, compute no-show fees with a 24-hour grace period, …'
          "
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <label v-if="current && (revising || drafted)" class="checkbox">
        <input v-model="revise" type="checkbox" :disabled="running" />
        <span>Revise the suite in the editor instead of starting from scratch</span>
      </label>
      <FormAlert :message="formError" />
      <div class="assistant__actions">
        <button
          v-if="!running"
          type="submit"
          class="btn"
          :class="{ 'btn--primary': !awaitingApply }"
          :disabled="busy"
        >
          {{ busy ? 'Starting…' : revise ? 'Revise suite' : 'Draft suite' }}
        </button>
        <button v-else type="button" class="btn" @click="cancel">Stop</button>
        <span v-if="draft" class="muted mono assistant__model">{{ draft.model.model }}</span>
      </div>
    </form>

    <div v-if="draft" class="assistant__status" aria-live="polite">
      <p v-if="running" class="assistant__line">
        <PhCircleNotch class="spin" aria-hidden="true" />
        Attempt {{ draft.attempt }} of {{ draft.maxAttempts }} · {{ elapsed }}
      </p>
      <template v-else-if="draft.status === 'ready' && draft.suite">
        <p class="assistant__line" :class="failedChecks.length ? 'is-warning' : 'is-ok'">
          <component :is="failedChecks.length ? PhWarning : PhCheck" aria-hidden="true" />
          Drafted {{ draft.suite.tasks.length }}
          {{ draft.suite.tasks.length === 1 ? 'task' : 'tasks' }} in {{ elapsed }} ({{
            draft.attempt
          }}
          {{ draft.attempt === 1 ? 'attempt' : 'attempts' }}). Self-check: {{ passedChecks }}/{{
            draft.checks.length
          }}
          reference answers pass.
        </p>
        <ul v-if="failedChecks.length" class="assistant__problems">
          <li v-for="check in failedChecks" :key="check.taskKey">
            <code>{{ check.taskKey }}</code> {{ check.problems.join(' ') }}
          </li>
        </ul>
        <p class="assistant__note">{{ changeSummary }}</p>
        <CodeBlock :code="draftJson" label="Draft suite" :collapsed-lines="16" />
        <div class="assistant__actions">
          <p v-if="appliedId === draft.id" class="assistant__line is-ok" role="status">
            <PhCheck aria-hidden="true" />
            Applied to the editor
          </p>
          <button v-else type="button" class="btn btn--primary" @click="apply">
            Apply to editor
          </button>
        </div>
        <p class="muted assistant__note">
          Check the expected values yourself before saving: a self-check proves the scorers agree
          with the agent's answers, not that the answers are right.
        </p>
      </template>
      <p v-else-if="draft.status === 'failed'" class="assistant__line is-error" role="alert">
        <PhWarning aria-hidden="true" />
        {{ draft.error ?? 'HighEval AI could not draft a valid suite.' }}
      </p>
      <p v-else-if="draft.status === 'cancelled'" class="muted">Stopped.</p>

      <details v-if="draft.activity.length" class="assistant__activity" :open="running">
        <summary class="label">Activity</summary>
        <ol class="mono">
          <li v-for="(entry, index) in draft.activity" :key="index">{{ entry.text }}</li>
        </ol>
      </details>
    </div>
  </section>
</template>

<style scoped>
.assistant {
  display: grid;
  gap: var(--space-sm);
  margin-top: var(--space-xl);
  padding: var(--space-md);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-control);
  background: var(--color-paper-2);
}

.assistant__title {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--text-lg);
}

.assistant__title svg {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-accent);
}

.assistant__intro {
  max-width: var(--prose-max);
  margin: 0;
  font-size: var(--text-sm);
}

.assistant__form {
  display: grid;
  gap: var(--space-xs);
  max-width: var(--form-max);
}

.assistant__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}

.assistant__model {
  font-size: var(--text-xs);
}

.assistant__status {
  display: grid;
  gap: var(--space-xs);
}

.assistant__line {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin: 0;
}

.assistant__line svg {
  width: 1rem;
  height: 1rem;
  flex: none;
}

.is-ok svg {
  color: var(--color-better);
}

.is-warning svg,
.is-error {
  color: var(--color-error);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}

.assistant__problems {
  margin: 0;
  padding-left: var(--space-md);
  font-size: var(--text-sm);
}

.assistant__note {
  margin: 0;
  font-size: var(--text-sm);
}

.assistant__activity ol {
  margin: var(--space-xs) 0 0;
  padding-left: var(--space-md);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.assistant__activity summary {
  cursor: pointer;
}
</style>
