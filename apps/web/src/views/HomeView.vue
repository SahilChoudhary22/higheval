<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { healthResponseSchema, type HealthResponse } from '@higheval/shared';
import { getJson } from '@/api/client';

const health = ref<HealthResponse | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    health.value = await getJson('/health', healthResponseSchema);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unknown error';
  }
});
</script>

<template>
  <section>
    <h1>HighEval</h1>
    <p v-if="error" role="alert">API unreachable: {{ error }}</p>
    <p v-else-if="health">API {{ health.status }} · v{{ health.version }}</p>
    <p v-else>Checking API…</p>
  </section>
</template>
