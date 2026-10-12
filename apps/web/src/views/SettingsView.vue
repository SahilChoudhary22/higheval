<script setup lang="ts">
import { api } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice.vue';
import PageHeader from '@/components/PageHeader.vue';
import ProviderKeyRow from '@/components/ProviderKeyRow.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useHealth } from '@/composables/useHealth';
import { useResource } from '@/composables/useResource';

const providers = useResource(() => api.providers.list());
const health = useHealth();

async function refresh(): Promise<void> {
  await Promise.all([providers.refresh(), health.refresh()]);
}
</script>

<template>
  <PageHeader title="Settings">
    <template #meta>
      <span>API keys for the model providers your configs run on.</span>
    </template>
  </PageHeader>

  <section class="section" aria-labelledby="providers-heading">
    <div class="section__head">
      <h2 id="providers-heading">Model providers</h2>
    </div>
    <p class="muted prose intro">
      A key saved here is checked with the provider, then used instead of the matching variable in
      <code>.env</code>. Keys are stored in the local database, readable only by your user, and are
      never sent back to the browser; only the last four characters are shown. The sample configs
      and the LLM judge use OpenRouter.
    </p>

    <ErrorNotice
      v-if="providers.error.value"
      title="Couldn't load providers."
      :error="providers.error.value"
      @retry="providers.refresh"
    />
    <SkeletonRows v-else-if="!providers.data.value" :rows="7" />
    <ul v-else class="providers">
      <ProviderKeyRow
        v-for="provider in providers.data.value"
        :key="provider.id"
        :provider="provider"
        @changed="refresh"
      />
    </ul>
  </section>
</template>

<style scoped>
.intro {
  margin: 0 0 var(--space-sm);
  font-size: var(--text-sm);
}

.providers {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
