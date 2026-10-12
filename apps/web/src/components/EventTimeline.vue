<script setup lang="ts">
import type { AgentEvent } from '@higheval/shared';
import { computed, ref } from 'vue';
import CodeBlock from './CodeBlock.vue';

const props = defineProps<{ events: AgentEvent[]; startedAt: string | null }>();

type EventType = AgentEvent['type'];
const TYPE_LABEL: Record<EventType, string> = {
  session: 'Session',
  text: 'Text',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  error: 'Error',
};
const shown = ref<Set<EventType>>(
  new Set(['session', 'text', 'tool_call', 'tool_result', 'error']),
);

const origin = computed(() => Date.parse(props.startedAt ?? props.events[0]?.at ?? ''));
const rows = computed(() =>
  props.events
    .map((event, index) => ({ event, step: index + 1 }))
    .filter(({ event }) => shown.value.has(event.type)),
);

function offset(at: string): string {
  const ms = Date.parse(at) - origin.value;
  if (!Number.isFinite(ms) || ms < 0) return '+00:00.0';
  const minutes = Math.floor(ms / 60_000);
  const seconds = (ms % 60_000) / 1_000;
  return `+${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function toggle(type: EventType): void {
  const next = new Set(shown.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  shown.value = next;
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);
</script>

<template>
  <div class="timeline">
    <fieldset class="timeline__filters">
      <legend class="visually-hidden">Show event types</legend>
      <label v-for="(label, type) in TYPE_LABEL" :key="type" class="checkbox">
        <input type="checkbox" :checked="shown.has(type)" @change="toggle(type)" />
        <span class="label">{{ label }}</span>
      </label>
    </fieldset>

    <ol class="timeline__list">
      <li
        v-for="{ event, step } in rows"
        :key="step"
        class="timeline__row"
        :class="{ 'timeline__row--nested': event.type === 'tool_result' }"
      >
        <span class="timeline__time mono"
          >{{ offset(event.at) }}<span class="muted"> #{{ step }}</span></span
        >
        <span class="timeline__type label" :class="`timeline__type--${event.type}`">{{
          TYPE_LABEL[event.type]
        }}</span>
        <div class="timeline__content">
          <template v-if="event.type === 'session'">
            <span
              >Started <code>{{ event.model ?? 'unknown model' }}</code></span
            >
            <span v-if="event.sessionId" class="muted">
              · session <code>{{ event.sessionId }}</code></span
            >
          </template>
          <p v-else-if="event.type === 'text'" class="timeline__text">{{ event.text.trim() }}</p>
          <template v-else-if="event.type === 'tool_call'">
            <p class="timeline__tool">{{ event.tool }}</p>
            <CodeBlock :code="pretty(event.arguments)" label="Arguments" :collapsed-lines="6" />
          </template>
          <template v-else-if="event.type === 'tool_result'">
            <p class="timeline__tool">
              {{ event.tool }}
              <span v-if="event.isError" class="timeline__flag">returned an error</span>
              <span v-if="event.durationMs !== null" class="muted">
                · {{ Math.round(event.durationMs) }} ms</span
              >
            </p>
            <CodeBlock :code="event.output" label="Output" :collapsed-lines="8" />
            <p v-if="event.truncated" class="muted timeline__note">
              Truncated by Hermes at {{ event.output.length.toLocaleString() }} characters; the
              agent saw the full output.
            </p>
          </template>
          <p v-else class="timeline__error">{{ event.message }}</p>
        </div>
      </li>
    </ol>
    <p v-if="rows.length === 0" class="muted">No events match the selected types.</p>
  </div>
</template>

<style scoped>
.timeline__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs) var(--space-md);
  margin: 0 0 var(--space-sm);
  padding: 0;
  border: 0;
}

.timeline__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-rule);
}

.timeline__row {
  display: grid;
  grid-template-columns: 7.5rem 6.5rem minmax(0, 1fr);
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-rule);
}

.timeline__row--nested .timeline__content {
  padding-left: var(--space-sm);
  border-left: 1px solid var(--color-rule-strong);
}

.timeline__time {
  font-size: var(--text-xs);
  white-space: nowrap;
}

.timeline__type {
  color: var(--color-ink-2);
}

.timeline__type--error {
  color: var(--color-error);
}

.timeline__content {
  display: grid;
  gap: var(--space-xs);
  min-width: 0;
}

.timeline__text {
  max-width: var(--prose-max);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.timeline__tool {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 600;
}

.timeline__flag,
.timeline__error {
  color: var(--color-error);
}

.timeline__note {
  font-size: var(--text-sm);
}

@media (width < 40rem) {
  .timeline__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .timeline__content {
    grid-column: 1 / -1;
  }
}
</style>
