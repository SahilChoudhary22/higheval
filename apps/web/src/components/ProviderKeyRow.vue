<script setup lang="ts">
import {
  providerKeyInputSchema,
  type ProviderStatus,
  type ProviderTestResult,
} from '@higheval/shared';
import { PhArrowSquareOut, PhCheck, PhCircleDashed, PhWarning } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { ApiError } from '@/api/client';
import { api } from '@/api/endpoints';
import { useToasts } from '@/composables/useToasts';
import type { TagSpec } from '@/lib/labels';
import StatusTag from './StatusTag.vue';

const props = defineProps<{ provider: ProviderStatus }>();
const emit = defineEmits<{ changed: [] }>();
const { show } = useToasts();

const key = ref('');
const busy = ref<'save' | 'test' | 'remove' | null>(null);
const error = ref<string | null>(null);
const result = ref<ProviderTestResult | null>(null);
const input = ref<HTMLInputElement | null>(null);

const inputId = computed(() => `key-${props.provider.id}`);
const messageId = computed(() => `key-message-${props.provider.id}`);

const tag = computed((): TagSpec => {
  if (!props.provider.configured)
    return { label: 'Not set', tone: 'neutral', icon: PhCircleDashed };
  return props.provider.source === 'settings'
    ? { label: 'Saved here', tone: 'better', icon: PhCheck }
    : { label: 'From .env', tone: 'equiv', icon: PhCheck };
});

const isError = computed(() => error.value !== null || result.value?.status === 'rejected');
const message = computed((): string => {
  if (error.value) return error.value;
  if (result.value) {
    return result.value.status === 'unverified'
      ? `${result.value.message} The key is kept; runs will report a provider error if it is wrong.`
      : result.value.message;
  }
  return props.provider.source === 'environment'
    ? 'Using the key from .env. Saving one here overrides it.'
    : '';
});

function describe(cause: unknown): string {
  if (cause instanceof ApiError && cause.issues.length > 0)
    return cause.issues.map((issue) => issue.message).join(' ');
  return cause instanceof Error ? cause.message : String(cause);
}

async function run(
  kind: NonNullable<typeof busy.value>,
  action: () => Promise<ProviderTestResult | null>,
): Promise<void> {
  busy.value = kind;
  error.value = null;
  result.value = null;
  try {
    result.value = await action();
    emit('changed');
  } catch (cause) {
    error.value = describe(cause);
    input.value?.focus();
  } finally {
    busy.value = null;
  }
}

async function save(): Promise<void> {
  const parsed = providerKeyInputSchema.safeParse({ apiKey: key.value });
  if (!parsed.success) {
    result.value = null;
    error.value = parsed.error.issues[0]?.message ?? 'That does not look like an API key';
    input.value?.focus();
    return;
  }
  await run('save', async () => {
    const outcome = await api.providers.saveKey(props.provider.id, parsed.data);
    key.value = '';
    show({ tone: 'info', message: `${props.provider.name} key saved.` });
    return outcome;
  });
}

const test = () => run('test', () => api.providers.test(props.provider.id));

const remove = () =>
  run('remove', async () => {
    await api.providers.removeKey(props.provider.id);
    show({ tone: 'info', message: `${props.provider.name} key removed.` });
    return null;
  });
</script>

<template>
  <li class="provider">
    <div class="provider__head">
      <h3 class="provider__name">{{ provider.name }}</h3>
      <StatusTag :spec="tag" />
      <span v-if="provider.keyHint" class="mono muted provider__hint">{{ provider.keyHint }}</span>
    </div>
    <p class="muted provider__meta">
      <span class="mono">{{ provider.keyEnvVar }}</span> · model IDs like
      <span class="mono">{{ provider.modelExample }}</span> ·
      <a :href="provider.keysUrl" target="_blank" rel="noopener noreferrer"
        >Get a key<PhArrowSquareOut class="provider__external" aria-hidden="true" /><span
          class="visually-hidden"
        >
          (opens in a new tab)</span
        ></a
      >
    </p>

    <form class="provider__form" novalidate @submit.prevent="save">
      <label class="visually-hidden" :for="inputId">{{ provider.name }} API key</label>
      <input
        :id="inputId"
        ref="input"
        v-model="key"
        class="input mono"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :placeholder="provider.configured ? 'Paste a new key to replace it' : 'Paste API key'"
        :aria-invalid="isError"
        :aria-describedby="messageId"
      />
      <button type="submit" class="btn btn--primary" :disabled="busy !== null || !key.trim()">
        {{ busy === 'save' ? 'Checking…' : 'Save' }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="busy !== null || !provider.configured"
        @click="test"
      >
        {{ busy === 'test' ? 'Testing…' : 'Test' }}
      </button>
      <button
        v-if="provider.source === 'settings'"
        type="button"
        class="btn btn--quiet"
        :disabled="busy !== null"
        @click="remove"
      >
        Remove
      </button>
    </form>
    <p
      :id="messageId"
      class="field__help provider__message"
      :class="{ 'field__help--error': isError }"
      role="status"
    >
      <component
        :is="result.status === 'valid' ? PhCheck : PhWarning"
        v-if="result && !error"
        class="provider__icon"
        aria-hidden="true"
      />
      {{ message }}
    </p>
  </li>
</template>

<style scoped>
.provider {
  display: grid;
  gap: var(--space-2xs);
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--color-rule);
}

.provider__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
}

.provider__name {
  margin: 0;
  font-size: var(--text-base);
}

.provider__hint {
  font-size: var(--text-sm);
}

.provider__meta {
  margin: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.provider__external {
  width: 0.75rem;
  height: 0.75rem;
  margin-left: 0.15em;
  vertical-align: -0.05em;
}

.provider__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-xs);
  max-width: var(--form-max);
  margin-top: var(--space-xs);
}

@media (width >= 40rem) {
  .provider__form {
    grid-template-columns: minmax(0, 1fr) auto auto auto;
  }
}

.provider__message {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin: 0;
}

.provider__icon {
  width: 0.875rem;
  height: 0.875rem;
  flex: none;
}
</style>
