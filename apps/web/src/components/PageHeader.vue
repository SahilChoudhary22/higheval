<script setup lang="ts">
import { RouterLink } from 'vue-router';

defineProps<{
  title: string;
  crumbs?: { label: string; to?: string }[];
}>();
</script>

<template>
  <header class="page-header">
    <nav v-if="crumbs?.length" class="page-header__crumbs label" aria-label="Breadcrumb">
      <template v-for="(crumb, index) in crumbs" :key="crumb.label">
        <RouterLink v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</RouterLink>
        <span v-else aria-current="page">{{ crumb.label }}</span>
        <span v-if="index < crumbs.length - 1" aria-hidden="true">/</span>
      </template>
    </nav>
    <div class="page-header__row">
      <div class="page-header__title">
        <h1 class="wrap-anywhere">{{ title }}</h1>
        <div v-if="$slots.meta" class="page-header__meta">
          <slot name="meta" />
        </div>
      </div>
      <div v-if="$slots.actions" class="page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-rule);
}

.page-header__crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-bottom: var(--space-xs);
}

.page-header__crumbs a {
  color: var(--color-muted);
  text-decoration: none;
}

@media (hover: hover) {
  .page-header__crumbs a:hover {
    color: var(--color-ink);
  }
}

.page-header__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.page-header__title {
  display: grid;
  gap: var(--space-2xs);
  min-width: 0;
}

.page-header__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs) var(--space-md);
  font-size: var(--text-sm);
  color: var(--color-muted);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
</style>
