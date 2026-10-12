<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue';

defineProps<{ title: string; error: Error }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="error-notice" role="alert">
    <TriangleAlert class="error-notice__icon" aria-hidden="true" />
    <div class="error-notice__body">
      <p class="error-notice__title">{{ title }}</p>
      <p class="muted wrap-anywhere">{{ error.message }}</p>
      <button type="button" class="btn btn--compact" @click="$emit('retry')">Retry</button>
    </div>
  </div>
</template>

<style scoped>
.error-notice {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-md) 0;
  max-width: var(--prose-max);
}

.error-notice__icon {
  width: 1.25rem;
  height: 1.25rem;
  flex: none;
  color: var(--color-error);
}

.error-notice__body {
  display: grid;
  gap: var(--space-xs);
  justify-items: start;
}

.error-notice__title {
  font-weight: 600;
  color: var(--color-error);
}
</style>
