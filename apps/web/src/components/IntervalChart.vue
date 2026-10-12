<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatSigned } from '@/lib/format';
import type { Tone } from '@/lib/labels';

/**
 * Confidence interval for the paired mean difference on a fixed −1…+1 axis,
 * with the zero line and the ±practical-margin band, so readers can see at a
 * glance whether the interval excludes zero or sits inside the margin.
 */
const props = defineProps<{
  lower: number;
  upper: number;
  estimate: number;
  margin: number;
  level: number;
  tone: Tone;
}>();

// The viewBox tracks the rendered width so labels stay at their real size on any screen.
const figure = ref<HTMLElement>();
const width = ref(640);
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(240, Math.round(entry.contentRect.width));
  });
  if (figure.value) observer.observe(figure.value);
});
onBeforeUnmount(() => observer?.disconnect());

const PAD = 20;
const AXIS_Y = 50;
const x = (value: number): number =>
  PAD + ((Math.max(-1, Math.min(1, value)) + 1) / 2) * (width.value - PAD * 2);

const majorTicks = [-1, -0.5, 0, 0.5, 1];
const minorTicks = computed(() =>
  width.value < 400
    ? []
    : Array.from({ length: 21 }, (_, index) => -1 + index * 0.1).filter(
        (value) => !majorTicks.some((major) => Math.abs(major - value) < 1e-9),
      ),
);

const clippedLow = computed(() => props.lower < -1);
const clippedHigh = computed(() => props.upper > 1);
const description = computed(
  () =>
    `${String(Math.round(props.level * 100))}% confidence interval for candidate minus baseline: ` +
    `${formatSigned(props.lower)} to ${formatSigned(props.upper)}, estimate ${formatSigned(props.estimate)}. ` +
    `Practical margin ±${props.margin.toFixed(2)}.`,
);
const tick = (value: number): string => (value === 0 ? '0' : formatSigned(value, 1));
</script>

<template>
  <figure ref="figure" class="interval">
    <svg
      :viewBox="`0 0 ${width} 96`"
      role="img"
      :aria-label="description"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        class="interval__band"
        :x="x(-margin)"
        y="18"
        :width="x(margin) - x(-margin)"
        height="44"
      />
      <line class="interval__band-edge" :x1="x(-margin)" :x2="x(-margin)" y1="18" y2="62" />
      <line class="interval__band-edge" :x1="x(margin)" :x2="x(margin)" y1="18" y2="62" />
      <text class="interval__band-label" :x="x(0)" y="12" text-anchor="middle">
        ±{{ margin.toFixed(2) }} margin
      </text>

      <line class="interval__axis" :x1="x(-1)" :x2="x(1)" :y1="AXIS_Y + 12" :y2="AXIS_Y + 12" />
      <line
        v-for="value in minorTicks"
        :key="`minor-${value}`"
        class="interval__tick"
        :x1="x(value)"
        :x2="x(value)"
        :y1="AXIS_Y + 12"
        :y2="AXIS_Y + 15"
      />
      <g v-for="value in majorTicks" :key="`major-${value}`">
        <line
          class="interval__tick"
          :x1="x(value)"
          :x2="x(value)"
          :y1="AXIS_Y + 12"
          :y2="AXIS_Y + 18"
        />
        <text class="interval__tick-label" :x="x(value)" :y="AXIS_Y + 30" text-anchor="middle">
          {{ tick(value) }}
        </text>
      </g>
      <line class="interval__zero" :x1="x(0)" :x2="x(0)" y1="18" :y2="AXIS_Y + 12" />

      <g :class="`interval__mark interval__mark--${tone}`">
        <line :x1="x(lower)" :x2="x(upper)" :y1="AXIS_Y - 10" :y2="AXIS_Y - 10" stroke-width="2" />
        <line
          v-if="!clippedLow"
          :x1="x(lower)"
          :x2="x(lower)"
          :y1="AXIS_Y - 14"
          :y2="AXIS_Y - 6"
          stroke-width="2"
        />
        <path v-else :d="`M ${x(-1)} ${AXIS_Y - 10} l 7 -4 v 8 z`" />
        <line
          v-if="!clippedHigh"
          :x1="x(upper)"
          :x2="x(upper)"
          :y1="AXIS_Y - 14"
          :y2="AXIS_Y - 6"
          stroke-width="2"
        />
        <path v-else :d="`M ${x(1)} ${AXIS_Y - 10} l -7 -4 v 8 z`" />
        <rect :x="x(estimate) - 3.5" :y="AXIS_Y - 13.5" width="7" height="7" />
      </g>
    </svg>
    <figcaption class="interval__caption">
      <span>{{ formatSigned(lower) }}</span>
      <span class="label">{{ Math.round(level * 100) }}% CI · candidate − baseline</span>
      <span>{{ formatSigned(upper) }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.interval {
  margin: 0;
  padding: var(--space-sm) 0 var(--space-xs);
  border: 1px solid var(--color-rule);
  background: var(--color-surface);
  animation: fade-in var(--dur-short) var(--ease-out);
}

svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.interval__band {
  fill: var(--color-band);
}

.interval__band-edge {
  stroke: var(--color-rule-strong);
  stroke-dasharray: 3 3;
}

.interval__band-label,
.interval__tick-label {
  fill: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.interval__axis,
.interval__tick {
  stroke: var(--color-rule-strong);
}

.interval__zero {
  stroke: var(--color-ink-2);
}

.interval__mark line {
  stroke: currentcolor;
}

.interval__mark rect,
.interval__mark path {
  fill: currentcolor;
}

.interval__mark--better {
  color: var(--color-better);
}

.interval__mark--worse {
  color: var(--color-worse);
}

.interval__mark--equiv,
.interval__mark--neutral,
.interval__mark--missing {
  color: var(--color-equiv);
}

.interval__mark--inconc {
  color: var(--color-inconc);
}

.interval__caption {
  padding: 0 var(--space-md);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}
</style>
