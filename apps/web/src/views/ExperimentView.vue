<script setup lang="ts">
import type { Arm, ArmSummary } from '@higheval/shared';
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import DiffBar from '@/components/DiffBar.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import PageHeader from '@/components/PageHeader.vue';
import RunProgress from '@/components/RunProgress.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import StatusTag from '@/components/StatusTag.vue';
import VerdictBlock from '@/components/VerdictBlock.vue';
import { useResource } from '@/composables/useResource';
import { useToasts } from '@/composables/useToasts';
import {
  formatCost,
  formatCount,
  formatDuration,
  formatPercent,
  formatRelative,
  formatScore,
} from '@/lib/format';
import { EXPERIMENT_STATUS, RUN_STATUS, shortId } from '@/lib/labels';
import { estimateRemainingMs, formatApproxDuration } from '@/lib/timing';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { show } = useToasts();

const isActive = (status: string | undefined): boolean =>
  status === 'queued' || status === 'running';
const POLL_MS = 3_000;

const experiment = useResource(() => api.experiments.get(props.id), {
  source: () => props.id,
  pollMs: (data) => (isActive(data?.status) ? POLL_MS : null),
});
const active = computed(() => isActive(experiment.data.value?.status));
const runs = useResource(() => api.experiments.runs(props.id), {
  source: () => props.id,
  pollMs: () => (active.value ? POLL_MS : null),
});
const comparison = useResource(() => api.experiments.comparison(props.id), {
  source: () => props.id,
  pollMs: () => (active.value ? POLL_MS : null),
});

const remaining = computed(() => {
  const data = experiment.data.value;
  if (!data || !active.value) return null;
  const ms = estimateRemainingMs(data.progress, data.startedAt);
  return ms === null ? 'Estimating time left…' : `${formatApproxDuration(ms)} left`;
});

const hasScores = computed(() => (experiment.data.value?.progress.scored ?? 0) > 0);

const ARM_ROWS: { label: string; value: (arm: ArmSummary) => string }[] = [
  { label: 'Model', value: (arm) => arm.model },
  { label: 'Mean score', value: (arm) => formatScore(arm.meanScore) },
  { label: 'Pass rate', value: (arm) => formatPercent(arm.passRate) },
  { label: 'Scored runs', value: (arm) => `${String(arm.scoredRuns)} of ${String(arm.runs)}` },
  { label: 'Errored runs', value: (arm) => String(arm.erroredRuns) },
  { label: 'Mean duration', value: (arm) => formatDuration(arm.meanDurationMs) },
  { label: 'Mean tokens / run', value: (arm) => formatCount(arm.meanTotalTokens) },
  { label: 'API calls', value: (arm) => String(arm.totalApiCalls) },
  { label: 'Provider cost', value: (arm) => formatCost(arm.totalCostUsd) },
  { label: 'Config hash', value: (arm) => arm.configHash.slice(0, 12) },
];

const armName = (arm: Arm): string =>
  (arm === 'baseline'
    ? experiment.data.value?.baseline.name
    : experiment.data.value?.candidate.name) ?? arm;

async function cancel(): Promise<void> {
  try {
    await api.experiments.cancel(props.id);
    await experiment.refresh();
  } catch (error) {
    show({ message: `Couldn't cancel the experiment. ${String(error)}`, tone: 'error' });
  }
}

async function remove(): Promise<void> {
  try {
    await api.experiments.remove(props.id);
    await router.push('/experiments');
  } catch (error) {
    show({ message: `Couldn't delete the experiment. ${String(error)}`, tone: 'error' });
  }
}
</script>

<template>
  <ErrorNotice
    v-if="experiment.error.value && !experiment.data.value"
    title="Couldn't load this experiment."
    :error="experiment.error.value"
    @retry="experiment.refresh"
  />
  <SkeletonRows v-else-if="!experiment.data.value" :rows="6" />
  <template v-else>
    <PageHeader
      :title="experiment.data.value.name"
      :crumbs="[
        { label: 'Experiments', to: '/experiments' },
        { label: shortId(experiment.data.value.id) },
      ]"
    >
      <template #meta>
        <StatusTag :spec="EXPERIMENT_STATUS[experiment.data.value.status]" />
        <span>
          Suite
          <RouterLink :to="`/suites/${experiment.data.value.suiteId}`">{{
            experiment.data.value.suiteName
          }}</RouterLink>
        </span>
        <span>{{ experiment.data.value.repetitions }}× per task</span>
        <span>Created {{ formatRelative(experiment.data.value.createdAt) }}</span>
        <span class="mono">seed {{ experiment.data.value.seed }}</span>
      </template>
      <template #actions>
        <a
          :href="`/api/experiments/${id}/report.md`"
          :download="`higheval-${shortId(id)}-report.md`"
          class="btn btn--quiet"
        >
          Report
        </a>
        <a
          :href="`/api/experiments/${id}/export.json`"
          :download="`higheval-${shortId(id)}-evidence.json`"
          class="btn btn--quiet"
        >
          Evidence
        </a>
        <button v-if="active" type="button" class="btn btn--danger" @click="cancel">
          Cancel experiment
        </button>
        <button v-else type="button" class="btn btn--danger" @click="remove">Delete</button>
      </template>
    </PageHeader>

    <section class="section" aria-labelledby="progress-heading">
      <div class="section__head">
        <h2 id="progress-heading">Progress</h2>
        <span v-if="remaining" class="muted" aria-live="polite">{{ remaining }}</span>
      </div>
      <RunProgress :progress="experiment.data.value.progress" />
    </section>

    <section class="section" aria-labelledby="verdict-heading">
      <div class="section__head">
        <h2 id="verdict-heading">Verdict</h2>
        <span class="label">{{ armName('candidate') }} − {{ armName('baseline') }}</span>
      </div>
      <p v-if="!hasScores" class="muted">The verdict appears once runs are scored.</p>
      <VerdictBlock v-else-if="comparison.data.value" :comparison="comparison.data.value" />
    </section>

    <section v-if="comparison.data.value" class="section" aria-labelledby="arms-heading">
      <div class="section__head"><h2 id="arms-heading">Configurations</h2></div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col"><span class="visually-hidden">Metric</span></th>
              <th scope="col" class="num">
                Baseline · {{ comparison.data.value.baseline.configName }}
              </th>
              <th scope="col" class="num">
                Candidate · {{ comparison.data.value.candidate.configName }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in ARM_ROWS" :key="row.label">
              <th scope="row" class="label">{{ row.label }}</th>
              <td class="num wrap-anywhere">{{ row.value(comparison.data.value.baseline) }}</td>
              <td class="num wrap-anywhere">{{ row.value(comparison.data.value.candidate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="comparison.data.value" class="section" aria-labelledby="tasks-heading">
      <div class="section__head">
        <h2 id="tasks-heading">Per task</h2>
        <span class="muted">Mean score per task; repetitions averaged first</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col" class="num">Baseline</th>
              <th scope="col" class="num">Candidate</th>
              <th scope="col" class="num">Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in comparison.data.value.tasks" :key="task.taskId">
              <td>
                {{ task.title }}
                <span class="mono muted task-key">{{ task.taskKey }}</span>
              </td>
              <td class="num">{{ formatScore(task.baselineMean) }}</td>
              <td class="num">{{ formatScore(task.candidateMean) }}</td>
              <td class="num"><DiffBar :value="task.difference" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section" aria-labelledby="runs-heading">
      <div class="section__head">
        <h2 id="runs-heading">Runs</h2>
        <span class="muted">In execution order; arms are interleaved</span>
      </div>
      <SkeletonRows v-if="!runs.data.value" />
      <div v-else class="table-wrap">
        <table class="table table--linked">
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Arm</th>
              <th scope="col">Status</th>
              <th scope="col" class="num">Score</th>
              <th scope="col" class="num">Duration</th>
              <th scope="col" class="num">Tokens</th>
              <th scope="col" class="num">Tools</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs.data.value" :key="run.id">
              <td>
                <RouterLink :to="`/runs/${run.id}`" class="row-link mono">{{
                  run.taskKey
                }}</RouterLink>
                <span v-if="experiment.data.value.repetitions > 1" class="muted">
                  #{{ run.repetition + 1 }}</span
                >
              </td>
              <td>{{ run.arm === 'baseline' ? 'Baseline' : 'Candidate' }}</td>
              <td><StatusTag :spec="RUN_STATUS[run.status]" /></td>
              <td class="num">{{ formatScore(run.score) }}</td>
              <td class="num">{{ formatDuration(run.durationMs) }}</td>
              <td class="num">{{ formatCount(run.tokens?.total) }}</td>
              <td class="num">{{ run.toolCalls }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </template>
</template>

<style scoped>
.task-key {
  display: block;
  font-size: var(--text-xs);
}
</style>
