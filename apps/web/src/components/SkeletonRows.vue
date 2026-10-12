<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 4 });
</script>

<template>
  <div class="skeleton" aria-busy="true" aria-label="Loading">
    <div v-for="row in rows" :key="row" class="skeleton__row">
      <span class="skeleton__block" :style="{ width: `${40 + ((row * 17) % 45)}%` }" />
      <span class="skeleton__block skeleton__block--short" />
    </div>
  </div>
</template>

<style scoped>
.skeleton__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: var(--row-height);
  border-bottom: 1px solid var(--color-rule);
}

.skeleton__block {
  height: 0.75rem;
  background: var(--color-paper-2);
  animation: pulse 1.4s var(--ease-in-out) infinite alternate;
}

.skeleton__block--short {
  width: 4rem;
}

@keyframes pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.45;
  }
}
</style>
