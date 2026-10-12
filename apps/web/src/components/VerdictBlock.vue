<script setup lang="ts">
import type { Comparison } from '@higheval/shared';
import { computed } from 'vue';
import { formatPValue, formatSigned, MISSING } from '@/lib/format';
import { VERDICT } from '@/lib/labels';
import { MIN_PAIRED_TASKS } from '@/lib/statistics';
import IntervalChart from './IntervalChart.vue';

const props = defineProps<{ comparison: Comparison }>();

const verdict = computed(() => VERDICT[props.comparison.verdict]);
const ci = computed(() => props.comparison.confidenceInterval);
const missingPairs = computed(() => Math.max(0, MIN_PAIRED_TASKS - props.comparison.pairedTasks));
</script>

<template>
  <div class="verdict">
    <p class="verdict__line" :class="`verdict__line--${verdict.tone}`">
      <component :is="verdict.icon" class="verdict__icon" aria-hidden="true" />
      {{ verdict.sentence }}
    </p>
    <p class="verdict__reason prose">
      {{ comparison.verdictReason }}
      <template v-if="comparison.verdict === 'insufficient_data' && missingPairs > 0">
        Needs {{ missingPairs }} more scored {{ missingPairs === 1 ? 'pair' : 'pairs' }}.
      </template>
    </p>

    <div class="verdict__evidence">
      <IntervalChart
        v-if="
          ci && comparison.meanDifference !== null && comparison.pairedTasks >= MIN_PAIRED_TASKS
        "
        :lower="ci.lower"
        :upper="ci.upper"
        :estimate="comparison.meanDifference"
        :margin="comparison.practicalMargin"
        :level="ci.level"
        :tone="verdict.tone"
      />
      <dl class="spec">
        <dt class="label">Mean difference</dt>
        <dd>{{ formatSigned(comparison.meanDifference) }}</dd>
        <dt class="label">
          {{ ci ? `${Math.round(ci.level * 100)}% CI` : 'Confidence interval' }}
        </dt>
        <dd>{{ ci ? `[${formatSigned(ci.lower)}, ${formatSigned(ci.upper)}]` : MISSING }}</dd>
        <dt class="label">Permutation test</dt>
        <dd>{{ formatPValue(comparison.pValue) }}</dd>
        <dt class="label">Wins / losses / ties</dt>
        <dd>{{ comparison.wins }} / {{ comparison.losses }} / {{ comparison.ties }}</dd>
        <dt class="label">Practical margin</dt>
        <dd>±{{ comparison.practicalMargin.toFixed(2) }}</dd>
        <dt class="label">Scored pairs</dt>
        <dd>
          {{ comparison.pairedTasks }} of {{ comparison.totalTasks }} tasks ·
          {{ comparison.repetitions }}× each
        </dd>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.verdict {
  display: grid;
  gap: var(--space-sm);
}

.verdict__line {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-family: var(--font-outlier);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-tight);
}

.verdict__icon {
  width: 1.375rem;
  height: 1.375rem;
  flex: none;
}

.verdict__line--better {
  color: var(--color-better);
}

.verdict__line--worse {
  color: var(--color-worse);
}

.verdict__line--equiv {
  color: var(--color-equiv);
}

.verdict__line--inconc {
  color: var(--color-inconc);
}

.verdict__line--missing {
  color: var(--color-muted);
}

.verdict__reason {
  color: var(--color-ink-2);
}

.verdict__evidence {
  display: grid;
  gap: var(--space-lg);
  margin-top: var(--space-sm);
}

@media (width >= 72rem) {
  .verdict__evidence {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    align-items: start;
  }
}
</style>
