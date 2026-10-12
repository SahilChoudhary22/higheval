<script setup lang="ts">
import type { TagSpec } from '@/lib/labels';

defineProps<{ spec: TagSpec }>();
</script>

<template>
  <span class="tag" :class="`tag--${spec.tone}`">
    <component
      :is="spec.icon"
      class="tag__icon"
      :class="{ 'tag__icon--spin': spec.spin }"
      aria-hidden="true"
    />
    {{ spec.label }}
  </span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  height: var(--tag-height);
  padding: 0 var(--space-xs) 0 var(--space-2xs);
  border: 1px solid transparent;
  border-radius: var(--radius-tag);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  white-space: nowrap;
}

.tag__icon {
  width: 0.8125rem;
  height: 0.8125rem;
  flex: none;
}

.tag__icon--spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}

.tag--neutral {
  background: var(--color-paper-2);
  color: var(--color-muted);
}

.tag--running {
  background: var(--color-accent-tint);
  color: var(--color-accent);
}

.tag--better {
  background: var(--color-better-bg);
  color: var(--color-better);
}

.tag--worse {
  background: var(--color-worse-bg);
  color: var(--color-worse);
}

.tag--equiv {
  background: var(--color-equiv-bg);
  color: var(--color-equiv);
}

.tag--inconc {
  background: var(--color-inconc-bg);
  color: var(--color-inconc);
}

.tag--error {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.tag--missing {
  border-style: dashed;
  border-color: var(--color-rule-strong);
  color: var(--color-muted);
}
</style>
