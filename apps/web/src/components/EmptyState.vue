<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{ icon: Component; title: string; detail: string }>();
</script>

<template>
  <div class="empty">
    <component :is="icon" class="empty__icon" aria-hidden="true" />
    <div class="empty__body">
      <p class="empty__title">{{ title }}</p>
      <p class="empty__detail muted">{{ detail }}</p>
      <div v-if="$slots.default" class="empty__action"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-lg) 0;
  max-width: var(--prose-max);
}

.empty__icon {
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
  margin-top: var(--space-3xs);
  color: var(--color-muted);
}

.empty__body {
  display: grid;
  gap: var(--space-2xs);
}

.empty__title {
  font-weight: 600;
}

.empty__action {
  margin-top: var(--space-sm);
}
</style>
