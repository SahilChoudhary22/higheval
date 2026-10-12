<script setup lang="ts">
import { PhCheck, PhX } from '@phosphor-icons/vue';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/endpoints';
import CodeBlock from '@/components/CodeBlock.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import EventTimeline from '@/components/EventTimeline.vue';
import JudgeDetails from '@/components/JudgeDetails.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import StatusTag from '@/components/StatusTag.vue';
import { useResource } from '@/composables/useResource';
import {
  formatCost,
  formatCount,
  formatDuration,
  formatScore,
  formatTimestamp,
  MISSING,
} from '@/lib/format';
import { RUN_STATUS, shortId, TERMINATION } from '@/lib/labels';

const props = defineProps<{ id: string }>();

const run = useResource(() => api.runs.get(props.id), {
  source: () => props.id,
  pollMs: (data) => (data?.status === 'queued' || data?.status === 'running' ? 2_000 : null),
});

const passedCount = computed(
  () => run.data.value?.scores.filter((score) => score.passed).length ?? 0,
);
const modelMismatch = computed(() => {
  const data = run.data.value;
  return Boolean(data?.reportedModel && data.reportedModel !== data.model);
});
</script>

<template>
  <ErrorNotice
    v-if="run.error.value && !run.data.value"
    title="Couldn't load this run."
    :error="run.error.value"
    @retry="run.refresh"
  />
  <SkeletonRows v-else-if="!run.data.value" :rows="6" />
  <template v-else>
    <PageHeader
      :title="run.data.value.taskTitle"
      :crumbs="[
        { label: 'Experiments', to: '/experiments' },
        {
          label: shortId(run.data.value.experimentId),
          to: `/experiments/${run.data.value.experimentId}`,
        },
        { label: `Run ${shortId(run.data.value.id)}` },
      ]"
    >
      <template #meta>
        <StatusTag :spec="RUN_STATUS[run.data.value.status]" />
        <span
          >{{ run.data.value.arm === 'baseline' ? 'Baseline' : 'Candidate' }} ·
          {{ run.data.value.configName }}</span
        >
        <span class="mono">{{ run.data.value.taskKey }}</span>
        <span v-if="run.data.value.status === 'scored'">
          Score <strong>{{ formatScore(run.data.value.score) }}</strong> ·
          {{ run.data.value.passed ? 'passed' : 'failed' }}
        </span>
      </template>
    </PageHeader>

    <div class="run">
      <div class="run__main">
        <section v-if="run.data.value.errorMessage" class="section" aria-labelledby="error-heading">
          <div class="section__head">
            <h2 id="error-heading" class="run__error-title">Why it errored</h2>
          </div>
          <p class="prose wrap-anywhere">{{ run.data.value.errorMessage }}</p>
          <p class="muted prose">
            Errored runs are infrastructure failures (provider, setup or crash). They are excluded
            from the comparison and counted as missing coverage.
          </p>
        </section>

        <section class="section" aria-labelledby="scores-heading">
          <div class="section__head">
            <h2 id="scores-heading">Scorers</h2>
            <span v-if="run.data.value.scores.length" class="muted">
              {{ passedCount }} of {{ run.data.value.scores.length }} passed
            </span>
          </div>
          <p v-if="!run.data.value.scores.length" class="muted">
            {{
              run.data.value.status === 'scored'
                ? 'No scorers ran.'
                : 'Scorers run once the agent finishes.'
            }}
          </p>
          <ul v-else class="scores">
            <li v-for="score in run.data.value.scores" :key="score.scorerIndex" class="scores__row">
              <span
                class="scores__mark"
                :class="score.passed ? 'scores__mark--pass' : 'scores__mark--fail'"
              >
                <component :is="score.passed ? PhCheck : PhX" aria-hidden="true" />
                <span class="visually-hidden">{{ score.passed ? 'Passed' : 'Failed' }}</span>
              </span>
              <div class="scores__body">
                <p class="scores__label">
                  {{ score.label }}
                  <span v-if="score.required" class="label scores__required">required</span>
                </p>
                <p class="muted wrap-anywhere">{{ score.reason }}</p>
                <JudgeDetails v-if="score.details" :details="score.details" />
              </div>
              <span class="label scores__weight">weight {{ score.weight }}</span>
            </li>
          </ul>
        </section>

        <section class="section" aria-labelledby="output-heading">
          <div class="section__head"><h2 id="output-heading">Final output</h2></div>
          <CodeBlock
            v-if="run.data.value.finalOutput"
            :code="run.data.value.finalOutput"
            label="Agent reply"
          />
          <p v-else class="muted">The agent produced no final reply.</p>
        </section>

        <section class="section" aria-labelledby="timeline-heading">
          <div class="section__head">
            <h2 id="timeline-heading">Timeline</h2>
            <span class="muted">{{ run.data.value.events.length }} events</span>
          </div>
          <EventTimeline
            v-if="run.data.value.events.length"
            :events="run.data.value.events"
            :started-at="run.data.value.startedAt"
          />
          <p v-else class="muted">No events recorded yet.</p>
        </section>

        <section class="section" aria-labelledby="prompt-heading">
          <div class="section__head"><h2 id="prompt-heading">Task prompt</h2></div>
          <CodeBlock :code="run.data.value.prompt" label="Prompt sent to the agent" />
        </section>
      </div>

      <aside class="run__sheet" aria-label="Run details">
        <dl class="spec">
          <dt class="label">Outcome</dt>
          <dd>
            {{ run.data.value.termination ? TERMINATION[run.data.value.termination] : MISSING }}
          </dd>
          <dt class="label">Model</dt>
          <dd class="mono">{{ run.data.value.model }}</dd>
          <dt class="label">Reported model</dt>
          <dd class="mono" :class="{ run__warn: modelMismatch }">
            {{ run.data.value.reportedModel ?? MISSING }}
          </dd>
          <dt class="label">Duration</dt>
          <dd>{{ formatDuration(run.data.value.durationMs) }}</dd>
          <dt class="label">Tokens in / out</dt>
          <dd>
            {{ formatCount(run.data.value.tokens?.input) }} /
            {{ formatCount(run.data.value.tokens?.output) }}
          </dd>
          <dt class="label">Cached input</dt>
          <dd>{{ formatCount(run.data.value.tokens?.cacheRead) }}</dd>
          <dt class="label">API calls</dt>
          <dd>{{ run.data.value.apiCalls ?? MISSING }}</dd>
          <dt class="label">Tool calls</dt>
          <dd>{{ run.data.value.toolCalls }}</dd>
          <dt class="label">Cost</dt>
          <dd>{{ formatCost(run.data.value.costUsd) }}</dd>
          <dt class="label">Attempts</dt>
          <dd>{{ run.data.value.attempts }}</dd>
          <dt class="label">Exit code</dt>
          <dd>{{ run.data.value.exitCode ?? MISSING }}</dd>
          <dt class="label">Started</dt>
          <dd>{{ formatTimestamp(run.data.value.startedAt) }}</dd>
        </dl>

        <div class="run__files">
          <h3 class="label">Workspace files</h3>
          <ul v-if="run.data.value.workspaceFiles.length" class="files">
            <li v-for="file in run.data.value.workspaceFiles" :key="file.path">
              <span class="mono wrap-anywhere">{{ file.path }}</span>
              <span class="muted">{{ formatCount(file.bytes) }} B</span>
            </li>
          </ul>
          <p v-else class="muted">None</p>
        </div>

        <CodeBlock
          v-if="run.data.value.stderrTail"
          :code="run.data.value.stderrTail"
          label="stderr (tail)"
          :collapsed-lines="10"
        />
        <RouterLink :to="`/experiments/${run.data.value.experimentId}`"
          >Back to experiment</RouterLink
        >
      </aside>
    </div>
  </template>
</template>

<style scoped>
.run {
  display: grid;
  gap: var(--space-xl);
}

.run__main {
  min-width: 0;
}

.run__sheet {
  display: grid;
  align-content: start;
  gap: var(--space-lg);
  min-width: 0;
}

.run__error-title {
  color: var(--color-error);
}

.run__warn {
  color: var(--color-worse);
}

.scores {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-rule);
}

.scores__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-rule);
}

.scores__mark {
  display: grid;
  place-items: center;
  width: var(--tag-height);
  height: var(--tag-height);
}

.scores__mark svg {
  width: 1rem;
  height: 1rem;
}

.scores__mark--pass {
  background: var(--color-better-bg);
  color: var(--color-better);
}

.scores__mark--fail {
  background: var(--color-worse-bg);
  color: var(--color-worse);
}

.scores__body {
  display: grid;
  gap: var(--space-3xs);
}

.scores__label {
  font-weight: 600;
}

.scores__required {
  margin-left: var(--space-xs);
  padding: 0 var(--space-2xs);
  border: 1px solid var(--color-rule-strong);
  border-radius: var(--radius-tag);
}

.scores__weight {
  white-space: nowrap;
}

.run__files {
  display: grid;
  gap: var(--space-xs);
}

.files {
  margin: 0;
  padding: 0;
  list-style: none;
}

.files li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-2xs) 0;
  border-bottom: 1px solid var(--color-rule);
}

@media (width >= 72rem) {
  .run {
    grid-template-columns: minmax(0, 1fr) 22rem;
  }

  .run__sheet {
    position: sticky;
    top: var(--space-xl);
    margin-top: var(--space-2xl);
  }
}
</style>
