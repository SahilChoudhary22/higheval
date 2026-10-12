<script setup lang="ts">
import { skillInputSchema, type SkillInput } from '@higheval/shared';
import { reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useFormErrors } from '@/composables/useFormErrors';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const { errors, formError, validate, fromError, clear } = useFormErrors();

const form = reactive<SkillInput>({ name: '', description: '', content: '' });
const loading = ref(Boolean(props.id));
const saving = ref(false);

watch(
  () => props.id,
  async (id) => {
    if (!id) return;
    loading.value = true;
    try {
      const { name, description, content } = await api.skills.get(id);
      Object.assign(form, { name, description, content });
    } catch (error) {
      fromError(error);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

async function save(): Promise<void> {
  clear();
  const input = {
    name: form.name.trim(),
    description: form.description.trim(),
    content: form.content,
  };
  if (!validate(skillInputSchema, input)) return;
  saving.value = true;
  try {
    if (props.id) await api.skills.update(props.id, input);
    else await api.skills.create(input);
    await router.push('/skills');
  } catch (error) {
    fromError(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageHeader
    :title="id ? 'Edit skill' : 'New skill'"
    :crumbs="[{ label: 'Skills', to: '/skills' }, { label: id ? 'Edit' : 'New' }]"
  >
    <template #meta>
      <span>Written to the run as SKILL.md and preloaded for every config that selects it.</span>
    </template>
  </PageHeader>

  <SkeletonRows v-if="loading" :rows="6" />
  <form v-else class="form" novalidate @submit.prevent="save">
    <div class="field">
      <label class="field__label" for="name">Name</label>
      <input
        id="name"
        v-model="form.name"
        class="input mono"
        placeholder="lowercase-with-hyphens"
        spellcheck="false"
        :aria-invalid="Boolean(errors.name)"
      />
      <p class="field__help" :class="{ 'field__help--error': errors.name }">
        {{ errors.name ?? 'Also the skill’s directory name.' }}
      </p>
    </div>
    <div class="field">
      <label class="field__label" for="description">Description</label>
      <input
        id="description"
        v-model="form.description"
        class="input"
        placeholder="When the agent should use this skill"
        :aria-invalid="Boolean(errors.description)"
      />
      <p class="field__help" :class="{ 'field__help--error': errors.description }">
        {{ errors.description ?? '' }}
      </p>
    </div>
    <div class="field">
      <label class="field__label" for="content">Instructions (markdown)</label>
      <textarea
        id="content"
        v-model="form.content"
        class="textarea textarea--code content"
        spellcheck="false"
        :aria-invalid="Boolean(errors.content)"
      />
      <p class="field__help" :class="{ 'field__help--error': errors.content }">
        {{ errors.content ?? '' }}
      </p>
    </div>
    <p v-if="formError" class="field__help field__help--error" role="alert">{{ formError }}</p>
    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="saving">
        {{ saving ? 'Saving…' : id ? 'Save skill' : 'Create skill' }}
      </button>
      <RouterLink to="/skills" class="btn btn--quiet">Cancel</RouterLink>
    </div>
  </form>
</template>

<style scoped>
.form {
  margin-top: var(--space-xl);
  display: grid;
  gap: var(--space-sm);
  max-width: var(--form-max);
}

.content {
  min-height: 20rem;
}

.form__actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
