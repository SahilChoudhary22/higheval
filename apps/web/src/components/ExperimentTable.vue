<script setup lang="ts">
import type { Experiment } from '@higheval/shared';
import { RouterLink } from 'vue-router';
import StatusTag from '@/components/StatusTag.vue';
import { formatRelative } from '@/lib/format';
import { EXPERIMENT_STATUS } from '@/lib/labels';

defineProps<{ experiments: Experiment[]; compact?: boolean }>();

const finished = (experiment: Experiment): number =>
  experiment.progress.scored + experiment.progress.errored + experiment.progress.cancelled;
</script>

<template>
  <div class="table-wrap">
    <table class="table table--linked">
      <thead>
        <tr>
          <th scope="col">Experiment</th>
          <th scope="col">Status</th>
          <th v-if="!compact" scope="col">Baseline → candidate</th>
          <th scope="col" class="num">Runs</th>
          <th scope="col" class="num">Created</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="experiment in experiments" :key="experiment.id">
          <td class="wrap-anywhere">
            <RouterLink :to="`/experiments/${experiment.id}`" class="row-link">{{
              experiment.name
            }}</RouterLink>
            <span class="sub muted">{{ experiment.suiteName }}</span>
          </td>
          <td><StatusTag :spec="EXPERIMENT_STATUS[experiment.status]" /></td>
          <td v-if="!compact" class="wrap-anywhere">
            {{ experiment.baseline.name }} <span class="muted">→</span>
            {{ experiment.candidate.name }}
          </td>
          <td class="num">{{ finished(experiment) }} / {{ experiment.progress.total }}</td>
          <td class="num">{{ formatRelative(experiment.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.sub {
  display: block;
  font-size: var(--text-sm);
}
</style>
