<script setup lang="ts">
import { skillInputSchema, type SkillInput } from '@higheval/shared';
import { reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import PageHeader from '@/components/PageHeader.vue';
import SkeletonRows from '@/components/SkeletonRows.vue';
import { useFormErrors } from '@/composables/useFormErrors';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const { formError, validate, fromError, errorFor, unclaimed, focusFirstInvalid, clear } =
  useFormErrors();
const FIELDS = ['name', 'description', 'content'] as const;
const formEl = ref<HTMLFormElement | null>(null);

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
  if (!validate(skillInputSchema, input)) {
    await focusFirstInvalid(formEl.value);
    return;
  }
  saving.value = true;
  try {
    if (props.id) await api.skills.update(props.id, input);
    else await api.skills.create(input);
    await router.push('/skills');
  } catch (error) {
    fromError(error);
    await focusFirstInvalid(formEl.value);
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
      <span>Written to the run as SKILL.md and preloaded for every agent that selects it.</span>
    </template>
  </PageHeader>

  <SkeletonRows v-if="loading" :rows="6" />
  <form v-else ref="formEl" class="form" novalidate @submit.prevent="save">
    <FormField
      id="name"
      v-slot="field"
      label="Name"
      :error="errorFor('name')"
      help="Also the skill’s directory name."
    >
      <input
        id="name"
        v-model="form.name"
        class="input mono"
        placeholder="lowercase-with-hyphens"
        spellcheck="false"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>
    <FormField id="description" v-slot="field" label="Description" :error="errorFor('description')">
      <input
        id="description"
        v-model="form.description"
        class="input"
        placeholder="When the agent should use this skill"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>
    <FormField
      id="content"
      v-slot="field"
      label="Instructions (markdown)"
      :error="errorFor('content')"
    >
      <textarea
        id="content"
        v-model="form.content"
        class="textarea textarea--code content"
        spellcheck="false"
        :aria-invalid="field.invalid"
        :aria-describedby="field.describedby"
      />
    </FormField>
    <FormAlert :message="formError" :details="unclaimed(FIELDS)" />
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
