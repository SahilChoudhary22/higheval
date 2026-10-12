<script setup lang="ts">
import type { RunProgress } from '@higheval/shared';
import { computed } from 'vue';

const props = defineProps<{ progress: RunProgress }>();

const segments = computed(() => {
  const total = Math.max(1, props.progress.total);
  const order = [
    { key: 'scored', label: 'Scored' },
    { key: 'errored', label: 'Errored' },
    { key: 'running', label: 'Running' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'queued', label: 'Queued' },
  ] as const;
  let offset = 0;
  return order.map(({ key, label }) => {
    const count = props.progress[key];
    const segment = { key, label, count, start: offset / total, share: count / total };
    offset += count;
    return segment;
  });
});
const done = computed(
  () => props.progress.scored + props.progress.errored + props.progress.cancelled,
);
</script>

<template>
  <div class="progress">
    <div
      class="progress__bar"
      role="progressbar"
      :aria-valuemin="0"
      :aria-valuemax="progress.total"
      :aria-valuenow="done"
      :aria-label="`${done} of ${progress.total} runs finished`"
    >
      <span
        v-for="segment in segments"
        :key="segment.key"
        class="progress__segment"
        :class="`progress__segment--${segment.key}`"
        :style="{ transform: `translateX(${segment.start * 100}%) scaleX(${segment.share})` }"
      />
    </div>
    <ul class="progress__legend" aria-live="polite">
      <li v-for="segment in segments" :key="segment.key">
        <span
          class="progress__swatch"
          :class="`progress__segment--${segment.key}`"
          aria-hidden="true"
        />
        <span class="label">{{ segment.label }}</span>
        <span class="progress__count">{{ segment.count }}</span>
      </li>
      <li class="progress__total">
        <span class="label">Total</span>
        <span class="progress__count">{{ progress.total }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.progress__bar {
  position: relative;
  height: 0.5rem;
  overflow: hidden;
  background: var(--color-paper-2);
}

.progress__segment {
  position: absolute;
  inset: 0;
  width: 100%;
  transform-origin: left;
  transition: transform var(--dur-long) var(--ease-out);
}

.progress__segment--scored {
  background: var(--color-equiv);
}

.progress__segment--errored {
  background: var(--color-error);
}

.progress__segment--running {
  background: var(--color-accent);
}

.progress__segment--cancelled {
  background: var(--color-rule-strong);
}

.progress__segment--queued {
  background: transparent;
}

.progress__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-lg);
  margin: var(--space-sm) 0 0;
  padding: 0;
  list-style: none;
}

.progress__legend li {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.progress__swatch {
  position: static;
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border: 1px solid var(--color-rule-strong);
}

.progress__count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.progress__total {
  margin-left: auto;
}
</style>
