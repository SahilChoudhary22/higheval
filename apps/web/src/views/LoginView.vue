<script setup lang="ts">
import { loginInputSchema, type Verdict } from '@higheval/shared';
import { PhEye, PhEyeSlash, PhSignIn } from '@phosphor-icons/vue';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import LogoMark from '@/components/LogoMark.vue';
import StatusTag from '@/components/StatusTag.vue';
import { useFormErrors } from '@/composables/useFormErrors';
import { useSession } from '@/composables/useSession';
import { VERDICT } from '@/lib/labels';

const route = useRoute();
const router = useRouter();
const { load } = useSession();
const { formError, validate, fromError, errorFor, focusFirstInvalid, clear } = useFormErrors();

const form = reactive({ username: '', password: '' });
const showPassword = ref(false);
const busy = ref(false);
const formEl = ref<HTMLFormElement | null>(null);

/** Only same-app paths, so a crafted link cannot send people elsewhere after sign-in. */
function destination(): string {
  const next = route.query.next;
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

async function signIn(): Promise<void> {
  clear();
  const input = validate(loginInputSchema, form);
  if (!input) {
    await focusFirstInvalid(formEl.value);
    return;
  }
  busy.value = true;
  try {
    await api.auth.login(input);
    await load(true);
    await router.replace(destination());
  } catch (error) {
    fromError(error);
    form.password = '';
    await focusFirstInvalid(formEl.value);
  } finally {
    busy.value = false;
  }
}

/**
 * Real verdicts from the experiments in docs/experiments, one of each kind, so
 * the first screen shows that HighEval also says "inconclusive" when it should.
 */
const VERDICTS: { change: string; verdict: Verdict; evidence: string }[] = [
  {
    change: 'Gave the agent a skill with the pricing rules',
    verdict: 'candidate_better',
    evidence: 'Better on 8 of 8 tasks',
  },
  {
    change: 'Took away its file tools',
    verdict: 'candidate_worse',
    evidence: 'Worse on 8 of 8 tasks',
  },
  {
    change: 'Switched to a newer model',
    verdict: 'inconclusive',
    evidence: 'Only 3 of 16 tasks differed',
  },
];
</script>

<template>
  <div class="login">
    <section class="login__brand" aria-labelledby="brand-question">
      <div class="brand__mark">
        <LogoMark class="brand__logo" />
        <span class="brand__name">HighEval</span>
      </div>
      <p id="brand-question" class="brand__question">
        Did the agent get better, worse, or stay the same?
      </p>
      <p class="brand__lede">
        Measure the impact of every agent change, and distinguish real improvements from statistical
        noise.
      </p>
      <div class="ledger">
        <p class="ledger__title">Verdicts from experiments run in this app</p>
        <ul class="ledger__rows">
          <li v-for="row in VERDICTS" :key="row.change" class="ledger__row">
            <span class="ledger__change">{{ row.change }}</span>
            <StatusTag class="ledger__tag" :spec="VERDICT[row.verdict]" />
            <span class="ledger__evidence">{{ row.evidence }}</span>
          </li>
        </ul>
      </div>
    </section>

    <main class="login__panel">
      <div class="panel">
        <div class="panel__mark">
          <LogoMark class="panel__logo" />
          <span class="brand__name">HighEval</span>
        </div>
        <h1 class="panel__title">Sign in</h1>
        <p class="muted panel__intro">Use the credentials you were given for this demo.</p>

        <form ref="formEl" class="panel__form" novalidate @submit.prevent="signIn">
          <FormField id="username" v-slot="field" label="Username" :error="errorFor('username')">
            <input
              id="username"
              v-model="form.username"
              class="input"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              autofocus
              :aria-invalid="field.invalid"
              :aria-describedby="field.describedby"
            />
          </FormField>
          <FormField id="password" v-slot="field" label="Password" :error="errorFor('password')">
            <div class="password">
              <input
                id="password"
                v-model="form.password"
                class="input"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                :aria-invalid="field.invalid"
                :aria-describedby="field.describedby"
              />
              <button
                type="button"
                class="password__toggle"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? PhEyeSlash : PhEye" aria-hidden="true" />
              </button>
            </div>
          </FormField>
          <FormAlert :message="formError" />
          <button type="submit" class="btn btn--primary panel__submit" :disabled="busy">
            <PhSignIn aria-hidden="true" />
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
        <p class="muted panel__note">You stay signed in for 12 hours on this browser.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  min-height: 100dvh;
  background: var(--color-paper);
}

@media (width >= 56rem) {
  .login {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  }
}

/* Brand panel: shown on wide screens only; the form repeats the mark on small ones. */
.login__brand {
  display: none;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-3xl) clamp(var(--space-xl), 7vw, 7rem) var(--space-3xl)
    clamp(var(--space-xl), 9vw, 9rem);
  border-right: 1px solid var(--color-rule);
  background: var(--color-paper-2);
}

@media (width >= 56rem) {
  .login__brand {
    display: flex;
  }
}

.brand__mark,
.panel__mark {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.brand__logo {
  width: 2.75rem;
  height: 2.75rem;
}

.brand__name {
  font-family: var(--font-outlier);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-ink);
}

.brand__question {
  max-width: 18ch;
  margin: var(--space-2xl) 0 var(--space-sm);
  font-family: var(--font-outlier);
  font-size: clamp(2rem, 3.4vw, 2.875rem);
  font-weight: 600;
  line-height: 1.08;
  text-wrap: balance;
  color: var(--color-ink);
}

.brand__lede {
  max-width: 40ch;
  margin: 0;
  color: var(--color-ink-2);
  text-wrap: pretty;
}

.ledger {
  max-width: 34rem;
  margin-top: var(--space-2xl);
}

.ledger__title {
  margin: 0 0 var(--space-xs);
  font-size: var(--text-sm);
  color: var(--color-muted);
}

.ledger__rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--color-ink);
}

/* Change and verdict on one line, the evidence beneath: read left to right like the app's tables. */
.ledger__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3xs) var(--space-md);
  align-items: center;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--color-rule);
}

.ledger__change {
  color: var(--color-ink);
}

.ledger__tag {
  justify-self: end;
}

.ledger__evidence {
  grid-column: 1 / -1;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-muted);
}

.login__panel {
  display: grid;
  place-items: center;
  padding: var(--space-xl) var(--gutter);
}

.panel {
  width: 100%;
  max-width: 22rem;
}

.panel__logo {
  width: 2.25rem;
  height: 2.25rem;
}

@media (width >= 56rem) {
  .panel__mark {
    display: none;
  }
}

.panel__title {
  margin: var(--space-xl) 0 var(--space-2xs);
  font-size: var(--text-xl);
}

@media (width >= 56rem) {
  .panel__title {
    margin-top: 0;
  }
}

.panel__intro {
  margin: 0 0 var(--space-lg);
}

.panel__form {
  display: grid;
  gap: var(--space-sm);
}

.password {
  position: relative;
}

.password .input {
  padding-right: 2.75rem;
}

.password__toggle {
  position: absolute;
  inset: 0 0 0 auto;
  display: grid;
  place-items: center;
  width: 2.5rem;
  border: 0;
  background: none;
  color: var(--color-muted);
  cursor: pointer;
}

.password__toggle svg {
  width: 1.125rem;
  height: 1.125rem;
}

.password__toggle:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: -2px;
  border-radius: var(--radius-control);
}

.panel__submit {
  justify-content: center;
  width: 100%;
  margin-top: var(--space-xs);
}

.panel__note {
  margin: var(--space-md) 0 0;
  font-size: var(--text-sm);
}
</style>
