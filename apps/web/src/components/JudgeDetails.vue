<script setup lang="ts">
import type { JudgeDetails } from '@higheval/shared';
import { formatCost, formatCount } from '@/lib/format';

defineProps<{ details: JudgeDetails }>();

const PIPS = [1, 2, 3, 4, 5] as const;
</script>

<template>
  <div class="judge">
    <table class="judge__table">
      <caption class="visually-hidden">
        Judge ratings per criterion
      </caption>
      <tbody>
        <tr v-for="criterion in details.criteria" :key="criterion.key">
          <th scope="row" class="judge__key">
            <span class="mono">{{ criterion.key }}</span>
            <span class="judge__description muted">{{ criterion.description }}</span>
          </th>
          <td class="judge__rating">
            <span class="judge__pips" aria-hidden="true">
              <span
                v-for="pip in PIPS"
                :key="pip"
                class="judge__pip"
                :class="{ 'judge__pip--on': pip <= criterion.rating }"
              />
            </span>
            <span>{{ criterion.rating }}/5</span>
          </td>
          <td class="judge__reason muted wrap-anywhere">{{ criterion.reason }}</td>
        </tr>
      </tbody>
    </table>
    <p class="judge__meta label">
      Judged by <span class="judge__model">{{ details.model }}</span> · {{ details.usage.requests }}
      {{ details.usage.requests === 1 ? 'request' : 'requests' }} ·
      {{ formatCount(details.usage.inputTokens + details.usage.outputTokens) }} tokens ·
      {{ formatCost(details.usage.costUsd) }}
    </p>
  </div>
</template>

<style scoped>
.judge {
  margin-top: var(--space-xs);
  padding-top: var(--space-xs);
  border-top: 1px dashed var(--color-rule);
}

.judge__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.judge__table th,
.judge__table td {
  padding: var(--space-2xs) var(--space-sm) var(--space-2xs) 0;
  vertical-align: top;
  text-align: left;
}

.judge__key {
  font-weight: 600;
  min-width: 9rem;
}

.judge__description {
  display: block;
  font-weight: var(--weight-body);
}

.judge__rating {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.judge__pips {
  display: inline-flex;
  gap: 2px;
  margin-right: var(--space-2xs);
  vertical-align: middle;
}

.judge__pip {
  width: 0.375rem;
  height: 0.75rem;
  background: var(--color-paper-3);
}

.judge__pip--on {
  background: var(--color-ink-2);
}

.judge__meta {
  margin-top: var(--space-2xs);
}

.judge__model {
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-ink-2);
}

@media (width < 40rem) {
  .judge__table tr {
    display: grid;
    padding: var(--space-2xs) 0;
  }

  .judge__table th,
  .judge__table td {
    padding: 0;
  }
}
</style>
