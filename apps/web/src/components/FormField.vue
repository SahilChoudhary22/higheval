<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** ID of the control; the label points at it and the message is `${id}-help`. */
  id: string;
  label: string;
  error?: string | undefined;
  help?: string;
}>();

const helpId = computed(() => `${props.id}-help`);
</script>

<template>
  <div class="field">
    <label class="field__label" :for="id">{{ label }}</label>
    <!-- The control binds these so assistive tech announces the message and the invalid state. -->
    <slot :describedby="helpId" :invalid="Boolean(error)" />
    <p :id="helpId" class="field__help" :class="{ 'field__help--error': error }">
      <template v-if="error">{{ error }}</template>
      <slot v-else name="help">{{ help }}</slot>
    </p>
  </div>
</template>
