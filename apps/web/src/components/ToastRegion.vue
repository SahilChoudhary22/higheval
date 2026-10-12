<script setup lang="ts">
import { PhWarning, PhX } from '@phosphor-icons/vue';
import { useToasts } from '@/composables/useToasts';

const { toasts, dismiss } = useToasts();
</script>

<template>
  <section class="toasts" aria-live="polite" aria-label="Notifications">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :role="toast.tone === 'error' ? 'alert' : 'status'"
      >
        <PhWarning v-if="toast.tone === 'error'" class="toast__icon" aria-hidden="true" />
        <p class="toast__message">{{ toast.message }}</p>
        <button
          v-if="toast.action"
          type="button"
          class="btn btn--compact"
          @click="toast.action.run"
        >
          {{ toast.action.label }}
        </button>
        <button type="button" class="toast__close" aria-label="Dismiss" @click="dismiss(toast.id)">
          <PhX aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: var(--space-md);
  bottom: var(--space-md);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-xs);
  width: min(26rem, calc(100% - var(--space-xl)));
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md);
  border: 1px solid var(--color-rule-strong);
  background: var(--color-surface);
  box-shadow: 0 1px 2px var(--color-shadow);
}

.toast__icon {
  width: 1rem;
  height: 1rem;
  flex: none;
  color: var(--color-error);
}

.toast__message {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
}

.toast__close {
  display: grid;
  place-items: center;
  width: var(--control-height-compact);
  height: var(--control-height-compact);
  border: 0;
  background: none;
  color: var(--color-muted);
  cursor: pointer;
}

.toast__close svg {
  width: 1rem;
  height: 1rem;
}

.toast-enter-active {
  transition:
    opacity var(--dur-short) var(--ease-out),
    transform var(--dur-short) var(--ease-out);
}

.toast-leave-active {
  transition: opacity var(--dur-micro) var(--ease-in);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(0.5rem);
}

.toast-leave-to {
  opacity: 0;
}
</style>
