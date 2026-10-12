<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import CodeBlock from '@/components/CodeBlock.vue';
import ErrorNotice from '@/components/ErrorNotice.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useResource } from '@/composables/useResource';
import { useToasts } from '@/composables/useToasts';
import { formatRelative } from '@/lib/format';
import { describeScorer } from '@/lib/scorers';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { show } = useToasts();
const suite = useResource(() => api.suites.get(props.id), { source: () => props.id });

async function remove(): Promise<void> {
  try {
    await api.suites.remove(props.id);
    await router.push('/suites');
  } catch (error) {
    show({ message: `Couldn't delete the suite. ${String(error)}`, tone: 'error' });
  }
}
</script>

<template>
  <ErrorNotice
    v-if="suite.error.value"
    title="Couldn't load this suite."
    :error="suite.error.value"
    @retry="suite.refresh"
  />
  <SkeletonRows v-else-if="!suite.data.value" :rows="6" />
  <template v-else>
    <PageHeader
      :title="suite.data.value.name"
      :crumbs="[{ label: 'Suites', to: '/suites' }, { label: suite.data.value.name }]"
    >
      <template #meta>
        <span>{{ suite.data.value.tasks.length }} tasks</span>
        <span>Updated {{ formatRelative(suite.data.value.updatedAt) }}</span>
      </template>
      <template #actions>
        <RouterLink :to="`/suites/${id}/edit`" class="btn">Edit</RouterLink>
        <button type="button" class="btn btn--danger" @click="remove">Delete</button>
      </template>
    </PageHeader>

    <p v-if="suite.data.value.description" class="prose description">
      {{ suite.data.value.description }}
    </p>

    <section
      v-for="(task, index) in suite.data.value.tasks"
      :key="task.id"
      class="section task"
      :aria-labelledby="`task-${task.id}`"
    >
      <div class="section__head">
        <h2 :id="`task-${task.id}`">
          <span class="task__index mono muted">{{ String(index + 1).padStart(2, '0') }}</span>
          {{ task.title }}
        </h2>
        <span class="mono muted">{{ task.key }}</span>
      </div>
      <div class="task__body">
        <div class="task__main">
          <CodeBlock :code="task.prompt" label="Prompt" :collapsed-lines="8" />
          <div v-if="task.fixtures.length" class="task__fixtures">
            <CodeBlock
              v-for="fixture in task.fixtures"
              :key="fixture.path"
              :code="fixture.content"
              :label="`Fixture · ${fixture.path}`"
              :collapsed-lines="6"
            />
          </div>
        </div>
        <div class="task__scoring">
          <table class="table">
            <caption class="label caption">
              Scorers · pass at ≥
              {{
                task.passThreshold.toFixed(2)
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col" class="num">Weight</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(scorer, scorerIndex) in task.scorers" :key="scorerIndex">
                <td class="wrap-anywhere">
                  <strong>{{ describeScorer(scorer).kind }}</strong>
                  <span class="mono on">{{ describeScorer(scorer).on }}</span>
                  <span class="check muted mono">{{ describeScorer(scorer).check }}</span>
                </td>
                <td class="num">{{ scorer.weight }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="task.tags.length" class="tags muted">
            <span v-for="tag in task.tags" :key="tag" class="mono">#{{ tag }}</span>
          </p>
        </div>
      </div>
    </section>
  </template>
</template>

<style scoped>
.description {
  margin-top: var(--space-lg);
  color: var(--color-ink-2);
}

.task__index {
  margin-right: var(--space-xs);
  font-size: var(--text-sm);
}

.task__body {
  display: grid;
  gap: var(--space-lg);
}

.task__main,
.task__fixtures {
  display: grid;
  gap: var(--space-sm);
  min-width: 0;
}

.task__scoring {
  min-width: 0;
}

.caption {
  padding-bottom: var(--space-xs);
  text-align: left;
}

.on {
  margin-left: var(--space-xs);
}

.check {
  display: block;
  font-size: var(--text-xs);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
  font-size: var(--text-xs);
}

@media (width >= 72rem) {
  .task__body {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}
</style>
