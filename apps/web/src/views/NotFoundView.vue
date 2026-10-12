<script setup lang="ts">
import { RouterLink } from 'vue-router';
import PageHeader from '@/components/PageHeader.vue';
</script>

<template>
  <PageHeader title="Page not found" />
  <p class="page-body prose">
    This address doesn’t match any page. <RouterLink to="/">Go to the overview</RouterLink>.
  </p>
</template>
