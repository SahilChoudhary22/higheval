<script setup lang="ts">
defineProps<{ message: string | null; details?: string[] }>();
</script>

<template>
  <div v-if="message" class="field__help field__help--error" role="alert">
    <p class="form-alert__message">{{ message }}</p>
    <ul v-if="details?.length" class="form-alert__details">
      <li v-for="detail in details" :key="detail">{{ detail }}</li>
    </ul>
  </div>
</template>

<style scoped>
.form-alert__message {
  margin: 0;
}

.form-alert__details {
  margin: var(--space-3xs) 0 0;
  padding-left: var(--space-md);
}
</style>
