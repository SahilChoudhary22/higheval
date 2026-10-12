<script setup lang="ts">
import { computed } from 'vue';
import { formatSigned } from '@/lib/format';

/** Tiny diverging bar for a per-task difference in [−1, 1]. */
const props = defineProps<{ value: number | null }>();

const share = computed(() => Math.min(1, Math.abs(props.value ?? 0)));
const direction = computed(() => {
  if (props.value === null || Math.abs(props.value) < 1e-9) return 'none';
  return props.value > 0 ? 'up' : 'down';
});
</script>

<template>
  <span class="diff">
    <span class="diff__track" aria-hidden="true">
      <span
        v-if="direction !== 'none'"
        class="diff__fill"
        :class="`diff__fill--${direction}`"
        :style="{ transform: `scaleX(${share})` }"
      />
      <span class="diff__tick" />
    </span>
    <span class="diff__value">{{ formatSigned(value) }}</span>
  </span>
</template>

<style scoped>
.diff {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-xs);
}

.diff__track {
  position: relative;
  width: 4rem;
  height: 0.5rem;
}

.diff__tick {
  position: absolute;
  left: 50%;
  top: -0.125rem;
  bottom: -0.125rem;
  width: 1px;
  background: var(--color-rule-strong);
}

.diff__fill {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
}

.diff__fill--up {
  left: 50%;
  background: var(--color-better);
  transform-origin: left;
}

.diff__fill--down {
  right: 50%;
  background: var(--color-worse);
  transform-origin: right;
}

.diff__value {
  min-width: 3.75rem;
  text-align: right;
}
</style>
