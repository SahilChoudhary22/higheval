<script setup lang="ts">
import { experimentInputSchema, type ExperimentInput } from '@higheval/shared';
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice.vue';
import PageHeader from '@/components/PageHeader.vue';
import { useFormErrors } from '@/composables/useFormErrors';
import { useResource } from '@/composables/useResource';

/** Rough planning figure from pilot runs: model requests per agent run. */
const REQUESTS_PER_RUN = 3;

const router = useRouter();
const suites = useResource(() => api.suites.list());
const configs = useResource(() => api.configs.list());
const { errors, formError, validate, fromError, clear } = useFormErrors();
const submitting = ref(false);

const form = reactive({
  name: '',
  suiteId: '',
  baselineConfigId: '',
  candidateConfigId: '',
  repetitions: 2,
  practicalMargin: 0.05,
});

// Sensible defaults once definitions load: first suite, first two configs.
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
const disabledReason = computed(() => {
  if (!form.suiteId) return 'Choose a suite.';
  if (!form.baselineConfigId || !form.candidateConfigId) return 'Choose two configs.';
  if (form.baselineConfigId === form.candidateConfigId) return 'Choose two different configs.';
  return null;
});

async function submit(): Promise<void> {
  clear();
  const input: ExperimentInput = { ...form, name: form.name.trim() || defaultName.value };
  if (!validate(experimentInputSchema, input)) return;
  submitting.value = true;
  try {
    const experiment = await api.experiments.create(input);
    await router.push(`/experiments/${experiment.id}`);
  } catch (error) {
    fromError(error);
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
    title="Couldn't load suites and configs."
    :error="(suites.error.value ?? configs.error.value)!"
    @retry="() => (suites.refresh(), configs.refresh())"
  />

  <form v-else class="form" novalidate @submit.prevent="submit">
    <div class="field">
      <label class="field__label" for="suite">Suite</label>
      <select
        id="suite"
        v-model="form.suiteId"
        class="select"
        :aria-invalid="Boolean(errors.suiteId)"
      >
        <option value="" disabled>Choose a suite</option>
        <option v-for="item in suites.data.value" :key="item.id" :value="item.id">
          {{ item.name }} ({{ item.taskCount }} tasks)
        </option>
      </select>
      <p class="field__help" :class="{ 'field__help--error': errors.suiteId }">
        {{ errors.suiteId ?? 'Every task in the suite runs under both configs.' }}
      </p>
    </div>

    <div class="form__pair">
      <div class="field">
        <label class="field__label" for="baseline">Baseline config</label>
        <select
          id="baseline"
          v-model="form.baselineConfigId"
          class="select"
          :aria-invalid="Boolean(errors.baselineConfigId)"
        >
          <option value="" disabled>Choose a config</option>
          <option v-for="item in configs.data.value" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <p class="field__help" :class="{ 'field__help--error': errors.baselineConfigId }">
          {{ errors.baselineConfigId ?? 'What you run today.' }}
        </p>
      </div>
      <div class="field">
        <label class="field__label" for="candidate">Candidate config</label>
        <select
          id="candidate"
          v-model="form.candidateConfigId"
          class="select"
          :aria-invalid="Boolean(errors.candidateConfigId)"
        >
          <option value="" disabled>Choose a config</option>
          <option v-for="item in configs.data.value" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <p class="field__help" :class="{ 'field__help--error': errors.candidateConfigId }">
          {{ errors.candidateConfigId ?? 'The change you are evaluating.' }}
        </p>
      </div>
    </div>

    <div class="form__pair">
      <div class="field">
        <label class="field__label" for="repetitions">Repetitions per task</label>
        <input
          id="repetitions"
          v-model.number="form.repetitions"
          class="input"
          type="number"
          min="1"
          max="10"
          :aria-invalid="Boolean(errors.repetitions)"
        />
        <p class="field__help" :class="{ 'field__help--error': errors.repetitions }">
          {{ errors.repetitions ?? 'Repeats are averaged per task, reducing run-to-run noise.' }}
        </p>
      </div>
      <div class="field">
        <label class="field__label" for="margin">Practical margin</label>
        <input
          id="margin"
          v-model.number="form.practicalMargin"
          class="input"
          type="number"
          min="0"
          max="1"
          step="0.01"
          placeholder="0.05"
          :aria-invalid="Boolean(errors.practicalMargin)"
        />
        <p class="field__help" :class="{ 'field__help--error': errors.practicalMargin }">
          {{
            errors.practicalMargin ??
            'Smallest score difference that matters. Set it before you see results.'
          }}
        </p>
      </div>
    </div>

    <div class="field">
      <label class="field__label" for="name">Name</label>
      <input
        id="name"
        v-model="form.name"
        class="input"
        :placeholder="defaultName || 'Candidate vs baseline'"
      />
      <p class="field__help">{{ errors.name ?? 'Optional. Defaults to the two config names.' }}</p>
    </div>

    <dl class="spec form__estimate">
      <dt class="label">Agent runs</dt>
      <dd>{{ runCount }}</dd>
      <dt class="label">Model requests (approx.)</dt>
      <dd>~{{ runCount * REQUESTS_PER_RUN }}</dd>
    </dl>

    <p v-if="formError" class="field__help field__help--error" role="alert">{{ formError }}</p>
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
