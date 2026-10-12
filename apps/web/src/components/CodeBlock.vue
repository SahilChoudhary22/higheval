<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

const props = withDefaults(
  defineProps<{ code: string; label?: string; collapsedLines?: number; maxHeight?: string }>(),
  { label: '', collapsedLines: 0, maxHeight: '24rem' },
);

const wrap = ref(true);
const copied = ref(false);
const expanded = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const lineCount = computed(() => props.code.split('\n').length);
const collapsible = computed(
  () => props.collapsedLines > 0 && lineCount.value > props.collapsedLines,
);
const visible = computed(() =>
  collapsible.value && !expanded.value
    ? props.code.split('\n').slice(0, props.collapsedLines).join('\n')
    : props.code,
);

async function copy(): Promise<void> {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copied.value = false), 2_500);
}

onBeforeUnmount(() => {
  clearTimeout(copyTimer);
});
</script>

<template>
  <figure class="code">
    <figcaption class="code__bar">
      <span class="label wrap-anywhere">{{ label }}</span>
      <span class="code__tools">
        <button type="button" class="code__tool" :aria-pressed="wrap" @click="wrap = !wrap">
          Wrap
        </button>
        <button type="button" class="code__tool" @click="copy">
          <span aria-live="polite">{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </span>
    </figcaption>
    <pre
      class="code__pre"
      :class="{ 'code__pre--wrap': wrap }"
      :style="{ maxHeight }"
    ><code>{{ visible }}</code></pre>
    <button v-if="collapsible" type="button" class="code__more" @click="expanded = !expanded">
      {{ expanded ? 'Show less' : `Show all ${lineCount} lines` }}
    </button>
  </figure>
</template>

<style scoped>
.code {
  margin: 0;
  border-top: 1px solid var(--color-rule-strong);
  border-bottom: 1px solid var(--color-rule-strong);
  background: var(--color-paper-2);
  min-width: 0;
}

.code__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-2xs) var(--space-sm);
  border-bottom: 1px solid var(--color-rule);
}

.code__tools {
  display: flex;
  gap: var(--space-xs);
}

.code__tool,
.code__more {
  padding: var(--space-3xs) var(--space-2xs);
  border: 0;
  background: none;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  cursor: pointer;
}

.code__tool[aria-pressed='true'] {
  color: var(--color-ink);
}

@media (hover: hover) {
  .code__tool:hover,
  .code__more:hover {
    color: var(--color-ink);
  }
}

.code__pre {
  margin: 0;
  padding: var(--space-sm);
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-code);
  color: var(--color-ink);
}

.code__pre--wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.code__more {
  display: block;
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  border-top: 1px solid var(--color-rule);
  text-align: left;
}
</style>
