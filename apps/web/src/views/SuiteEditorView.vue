<script setup lang="ts">
import { suiteInputSchema, type Suite, type SuiteInput } from '@higheval/shared';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useFormErrors } from '@/composables/useFormErrors';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const { errors, formError, fromError, clear } = useFormErrors();

const TEMPLATE: SuiteInput = {
  name: 'New suite',
  description: 'What this suite measures.',
  tasks: [
    {
      key: 'example-task',
      title: 'Example task',
      prompt: 'Read data.csv and write the number of rows to result.json as {"rows": <count>}.',
      fixtures: [{ path: 'data.csv', content: 'id,name\n1,Alpha\n2,Beta\n' }],
      scorers: [
        { type: 'file_exists', path: 'result.json' },
        {
          type: 'json_field',
          target: { kind: 'file', path: 'result.json' },
          path: 'rows',
          expected: 2,
          weight: 2,
        },
      ],
      passThreshold: 1,
      tags: [],
    },
  ],
};

function toInput(suite: Suite): SuiteInput {
  return {
    name: suite.name,
    description: suite.description,
    tasks: suite.tasks.map(({ key, title, prompt, fixtures, scorers, passThreshold, tags }) => ({
      key,
      title,
      prompt,
      fixtures,
      scorers,
      passThreshold,
      tags,
    })),
  };
}

const source = ref('');
const loading = ref(Boolean(props.id));
const saving = ref(false);

watch(
  () => props.id,
  async (id) => {
    if (!id) {
      source.value = JSON.stringify(TEMPLATE, null, 2);
      return;
    }
    loading.value = true;
    try {
      source.value = JSON.stringify(toInput(await api.suites.get(id)), null, 2);
    } catch (error) {
      fromError(error);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

/** Live validation: JSON syntax first, then the shared suite contract. */
const parsed = computed(() => {
  let json: unknown;
  try {
    json = JSON.parse(source.value);
  } catch (error) {
    return {
      ok: false as const,
      issues: [{ path: '', message: error instanceof Error ? error.message : 'Invalid JSON' }],
    };
  }
  const result = suiteInputSchema.safeParse(json);
  return result.success
    ? { ok: true as const, value: result.data, issues: [] }
    : {
        ok: false as const,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
});

const serverIssues = computed(() =>
  Object.entries(errors.value).map(([path, message]) => ({ path, message })),
);
const issues = computed(() => (parsed.value.ok ? serverIssues.value : parsed.value.issues));

async function save(): Promise<void> {
  clear();
  if (!parsed.value.ok) return;
  saving.value = true;
  try {
    const suite = props.id
      ? await api.suites.update(props.id, parsed.value.value)
      : await api.suites.create(parsed.value.value);
    await router.push(`/suites/${suite.id}`);
  } catch (error) {
    fromError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageHeader
    :title="id ? 'Edit suite' : 'New suite'"
    :crumbs="[{ label: 'Suites', to: '/suites' }, { label: id ? 'Edit' : 'New' }]"
  >
    <template #meta>
      <span>Edit as JSON. Experiments already launched keep their own snapshot of the tasks.</span>
    </template>
  </PageHeader>

  <SkeletonRows v-if="loading" :rows="8" />
  <form v-else class="editor" novalidate @submit.prevent="save">
    <div class="field">
      <label class="field__label" for="suite-json">Suite definition</label>
      <textarea
        id="suite-json"
        v-model="source"
        class="textarea textarea--code editor__text"
        spellcheck="false"
        :aria-invalid="!parsed.ok"
        aria-describedby="suite-issues"
      />
    </div>

    <div id="suite-issues" class="editor__status" aria-live="polite">
      <p v-if="parsed.ok && issues.length === 0" class="muted">
        Valid · {{ parsed.value.tasks.length }} tasks,
        {{ parsed.value.tasks.reduce((sum, task) => sum + task.scorers.length, 0) }} scorers
      </p>
      <ul v-else class="issues">
        <li v-for="issue in issues" :key="`${issue.path}:${issue.message}`">
          <code v-if="issue.path">{{ issue.path }}</code> {{ issue.message }}
        </li>
      </ul>
    </div>

    <details class="reference">
      <summary class="label">Scorer reference</summary>
      <ul class="muted">
        <li><code>contains</code> — target text includes <code>value</code></li>
        <li>
          <code>regex</code> — target matches <code>pattern</code> (optional <code>flags</code>)
        </li>
        <li>
          <code>json_valid</code> — target parses as JSON (fenced or embedded JSON is accepted)
        </li>
        <li>
          <code>json_field</code> — value at <code>path</code> equals <code>expected</code>;
          optional <code>tolerance</code>, <code>unordered</code>, and <code>exact</code> (no extra
          keys)
        </li>
        <li><code>file_exists</code> — the agent created <code>path</code></li>
        <li>
          <code>tool_called</code> — <code>tool</code> was used between <code>min</code> and
          <code>max</code> times
        </li>
        <li>
          <code>llm_judge</code> — a pinned <code>judge</code> model rates the target from 1 to 5 on
          each of <code>criteria</code> (<code>key</code>, <code>description</code>) using the
          <code>rubric</code>; passes at <code>passThreshold</code> (default 0.7). The judge must
          not be either model under test.
        </li>
      </ul>
      <p class="muted">
        Any scorer can set <code>"required": true</code>: if it fails, the task fails regardless of
        its weighted score. Use it for hard rules, and judges for quality.
      </p>
      <p class="muted">
        Targets are <code>{"kind": "final_output"}</code> or
        <code>{"kind": "file", "path": "…"}</code>. Expected values live only here, never in
        fixtures the agent can read.
      </p>
    </details>

    <p v-if="formError" class="field__help field__help--error" role="alert">{{ formError }}</p>
    <div class="editor__actions">
      <button type="submit" class="btn btn--primary" :disabled="!parsed.ok || saving">
        {{ saving ? 'Saving…' : 'Save suite' }}
      </button>
      <RouterLink :to="id ? `/suites/${id}` : '/suites'" class="btn btn--quiet">Cancel</RouterLink>
    </div>
  </form>
</template>

<style scoped>
.editor {
  margin-top: var(--space-xl);
  display: grid;
  gap: var(--space-sm);
}

.editor__text {
  min-height: 32rem;
}

.issues {
  margin: 0;
  padding-left: var(--space-md);
  color: var(--color-error);
}

.reference ul {
  margin: var(--space-xs) 0;
  padding-left: var(--space-md);
}

.reference summary {
  cursor: pointer;
}

.reference p {
  max-width: var(--prose-max);
  font-size: var(--text-sm);
}

.editor__actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
