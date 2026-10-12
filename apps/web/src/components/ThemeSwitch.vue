<script setup lang="ts">
import { PhDesktop, PhMoon, PhSun } from '@phosphor-icons/vue';
import { useTheme, type ThemePreference } from '@/composables/useTheme';

const { preference, setPreference } = useTheme();

const OPTIONS: { value: ThemePreference; label: string; icon: typeof PhSun }[] = [
  { value: 'system', label: 'System', icon: PhDesktop },
  { value: 'light', label: 'Light', icon: PhSun },
  { value: 'dark', label: 'Dark', icon: PhMoon },
];
</script>

<template>
  <fieldset class="theme">
    <legend class="label theme__legend">Theme</legend>
    <div class="theme__options">
      <label
        v-for="option in OPTIONS"
        :key="option.value"
        class="theme__option"
        :class="{ 'theme__option--active': preference === option.value }"
        :title="option.label"
      >
        <input
          type="radio"
          name="theme"
          class="visually-hidden"
          :value="option.value"
          :checked="preference === option.value"
          @change="setPreference(option.value)"
        />
        <component
          :is="option.icon"
          :weight="preference === option.value ? 'fill' : 'regular'"
          aria-hidden="true"
        />
        <span class="visually-hidden">{{ option.label }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.theme {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  border: 0;
}

.theme__legend {
  float: left;
  padding: 0;
}

.theme__options {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-control);
}

.theme__option {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.5rem;
  border-radius: calc(var(--radius-control) - 2px);
  color: var(--color-muted);
  cursor: pointer;
}

.theme__option svg {
  width: 0.9375rem;
  height: 0.9375rem;
}

.theme__option--active {
  background: var(--color-accent-tint);
  color: var(--color-accent);
}

.theme__option:has(input:focus-visible) {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

@media (hover: hover) {
  .theme__option:not(.theme__option--active):hover {
    color: var(--color-ink);
  }
}
</style>
