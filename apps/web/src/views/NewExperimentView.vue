<script setup lang="ts">
import { experimentInputSchema, type ExperimentInput } from '@higheval/shared';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import PageHeader from '@/components/PageHeader.vue';
import { useFormErrors } from '@/composables/useFormErrors';
import { useHealth } from '@/composables/useHealth';
import { useResource } from '@/composables/useResource';
import { estimateDurationMs, formatApproxDuration, TYPICAL_RUN_SECONDS } from '@/lib/timing';

/** Rough planning figure from pilot runs: model requests per agent run. */
const REQUESTS_PER_RUN = 3;

const router = useRouter();
const suites = useResource(() => api.suites.list());
const configs = useResource(() => api.configs.list());
const health = useHealth();
const { formError, validate, fromError, errorFor, unclaimed, focusFirstInvalid, clear } =
  useFormErrors();
const FIELDS = [
  'name',
  'suiteId',
  'baselineConfigId',
  'candidateConfigId',
  'repetitions',
  'practicalMargin',
] as const;
const formEl = ref<HTMLFormElement | null>(null);
const submitting = ref(false);

const form = reactive({
  name: '',
  suiteId: '',
  baselineConfigId: '',
  candidateConfigId: '',
  repetitions: 2,
  practicalMargin: 0.05,
});

// Sensible defaults once definitions load: first suite, first two agents.
watch([suites.data, configs.data], ([suiteList, configList]) => {
  if (suiteList?.[0] && !form.suiteId) form.suiteId = suiteList[0].id;
  if (configList && configList.length >= 2 && !form.baselineConfigId) {
    form.baselineConfigId = configList[0]?.id ?? '';
    form.candidateConfigId = configList[1]?.id ?? '';
  }
});

const suite = computed(() => suites.data.value?.find((item) => item.id === form.suiteId));
const configName = (id: string): string =>
  configs.data.value?.find((item) => item.id === id)?.name ?? '';
const defaultName = computed(() =>
  form.baselineConfigId && form.candidateConfigId
    ? `${configName(form.candidateConfigId)} vs ${configName(form.baselineConfigId)}`
    : '',
);
const runCount = computed(() => (suite.value?.taskCount ?? 0) * 2 * form.repetitions);
const concurrency = computed(() => health.data.value?.maxConcurrentRuns ?? 1);
const duration = computed(() =>
  formatApproxDuration(estimateDurationMs(runCount.value, concurrency.value)),
);
const disabledReason = computed(() => {
  if (!form.suiteId) return 'Choose a suite.';
  if (!form.baselineConfigId || !form.candidateConfigId) return 'Choose two agents.';
  if (form.baselineConfigId === form.candidateConfigId) return 'Choose two different agents.';
  return null;
});

async function submit(): Promise<void> {
  clear();
  const input: ExperimentInput = { ...form, name: form.name.trim() || defaultName.value };
  if (!validate(experimentInputSchema, input)) {
    await focusFirstInvalid(formEl.value);
    return;
  }
  submitting.value = true;
  try {
    const experiment = await api.experiments.create(input);
    await router.push(`/experiments/${experiment.id}`);
  } catch (error) {
    fromError(error);
    await focusFirstInvalid(formEl.value);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <PageHeader
    title="Launch experiment"
    :crumbs="[{ label: 'Experiments', to: '/experiments' }, { label: 'New' }]"
  />

  <ErrorNotice
    v-if="suites.error.value || configs.error.value"
    title="Couldn't load suites and agents."
    :error="(suites.error.value ?? configs.error.value)!"
    @retry="() => (suites.refresh(), configs.refresh())"
  />

  <form v-else ref="formEl" class="form" novalidate @submit.prevent="submit">
    <FormField
      id="suite"
      v-slot="field"
      label="Suite"
      :error="errorFor('suiteId')"
      help="Every task in the suite runs with both agents."
    >
      <select
        id="suite"
        v-model="form.suiteId"
        class="select"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      >
        <option value="" disabled>Choose a suite</option>
        <option v-for="item in suites.data.value" :key="item.id" :value="item.id">
          {{ item.name }} ({{ item.taskCount }} tasks)
        </option>
      </select>
    </FormField>

    <div class="form__pair">
      <FormField
        id="baseline"
        v-slot="field"
        label="Baseline agent"
        :error="errorFor('baselineConfigId')"
        help="What you run today."
      >
        <select
          id="baseline"
          v-model="form.baselineConfigId"
          class="select"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        >
          <option value="" disabled>Choose an agent</option>
          <option v-for="item in configs.data.value" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </FormField>
      <FormField
        id="candidate"
        v-slot="field"
        label="Candidate agent"
        :error="errorFor('candidateConfigId')"
        help="The change you are evaluating."
      >
        <select
          id="candidate"
          v-model="form.candidateConfigId"
          class="select"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        >
          <option value="" disabled>Choose an agent</option>
          <option v-for="item in configs.data.value" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </FormField>
    </div>

    <div class="form__pair">
      <FormField
        id="repetitions"
        v-slot="field"
        label="Repetitions per task"
        :error="errorFor('repetitions')"
        help="Repeats are averaged per task, reducing run-to-run noise."
      >
        <input
          id="repetitions"
          v-model.number="form.repetitions"
          class="input"
          type="number"
          min="1"
          max="10"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
      <FormField
        id="margin"
        v-slot="field"
        label="Practical margin"
        :error="errorFor('practicalMargin')"
        help="Smallest score difference that matters. Set it before you see results."
      >
        <input
          id="margin"
          v-model.number="form.practicalMargin"
          class="input"
          type="number"
          min="0"
          max="1"
          step="0.01"
          placeholder="0.05"
          :aria-invalid="field.invalid"
          :aria-describedby="field.describedby"
        />
      </FormField>
    </div>

    <FormField
      id="name"
      v-slot="field"
      label="Name"
      :error="errorFor('name')"
      help="Optional. Defaults to the two agent names."
    >
      <input
        id="name"
        v-model="form.name"
        class="input"
        :placeholder="defaultName || 'Candidate vs baseline'"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>

    <dl class="spec form__estimate">
      <dt class="label">Agent runs</dt>
      <dd>{{ runCount }}</dd>
      <dt class="label">Model requests (approx.)</dt>
      <dd>~{{ runCount * REQUESTS_PER_RUN }}</dd>
      <dt class="label">Duration on free models</dt>
      <dd>{{ duration }} · {{ concurrency }} at a time, ~{{ TYPICAL_RUN_SECONDS }} s each</dd>
    </dl>

    <FormAlert :message="formError" :details="unclaimed(FIELDS)" />
    <div class="form__actions">
      <button
        type="submit"
        class="btn btn--primary"
        :disabled="Boolean(disabledReason) || submitting"
      >
        {{ submitting ? 'Launching…' : 'Launch experiment' }}
      </button>
      <RouterLink to="/experiments" class="btn btn--quiet">Cancel</RouterLink>
      <span v-if="disabledReason" class="muted">{{ disabledReason }}</span>
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

.form__pair {
  display: grid;
  gap: var(--space-sm) var(--space-lg);
}

@media (width >= 40rem) {
  .form__pair {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.form__estimate {
  margin: var(--space-xs) 0 var(--space-md);
}

.form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}
</style>
