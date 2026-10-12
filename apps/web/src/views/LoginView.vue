<script setup lang="ts">
import { loginInputSchema } from '@higheval/shared';
import { PhEye, PhEyeSlash, PhSignIn } from '@phosphor-icons/vue';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/endpoints';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import LogoMark from '@/components/LogoMark.vue';
import { useFormErrors } from '@/composables/useFormErrors';
import { useSession } from '@/composables/useSession';

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

/** Real results from docs/experiments/capabilities.md, drawn as the verdict chart draws them. */
const RESULTS = [
  { label: 'Knowledge skill', low: 1, high: 1, estimate: 1 },
  { label: 'Procedure skill', low: 0.675, high: 0.8, estimate: 0.738 },
  { label: 'Seeded memory', low: 1, high: 1, estimate: 1 },
  { label: 'Tools removed', low: -1, high: -0.813, estimate: -0.938 },
];
/** Maps a difference in [-1, 1] to the chart's x coordinate. */
const x = (value: number): number => 120 + ((value + 1) / 2) * 260;
</script>

<template>
  <div class="login">
    <section class="login__brand" aria-hidden="true">
      <div class="brand__mark">
        <LogoMark class="brand__logo" />
        <span class="brand__name">HighEval</span>
      </div>
      <p class="brand__lede">Did the agent get better, worse, or stay the same?</p>
      <p class="brand__sub">A/B evaluations for Hermes Agent, with evidence.</p>
      <svg class="brand__chart" viewBox="0 0 400 190">
        <line class="chart__zero" :x1="x(0)" :x2="x(0)" y1="8" y2="160" />
        <g v-for="(result, index) in RESULTS" :key="result.label">
          <text class="chart__label" x="0" :y="30 + index * 38">{{ result.label }}</text>
          <line
            class="chart__interval"
            :class="result.estimate > 0 ? 'is-better' : 'is-worse'"
            :x1="x(result.low) - (result.low === result.high ? 4 : 0)"
            :x2="x(result.high) + (result.low === result.high ? 4 : 0)"
            :y1="26 + index * 38"
            :y2="26 + index * 38"
          />
          <rect
            class="chart__estimate"
            :class="result.estimate > 0 ? 'is-better' : 'is-worse'"
            :x="x(result.estimate) - 5"
            :y="21 + index * 38"
            width="10"
            height="10"
          />
        </g>
        <text class="chart__axis" :x="x(-1)" y="182" text-anchor="middle">−1</text>
        <text class="chart__axis" :x="x(0)" y="182" text-anchor="middle">0</text>
        <text class="chart__axis" :x="x(1)" y="182" text-anchor="middle">+1</text>
      </svg>
      <p class="brand__caption">
        95% intervals from four real experiments: one setting changed, one free model.
      </p>
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
  gap: var(--space-md);
  padding: var(--space-3xl) clamp(var(--space-xl), 6vw, 6rem);
  border-right: 1px solid var(--color-rule);
  background:
    radial-gradient(circle at 15% 10%, var(--color-accent-tint), transparent 55%),
    var(--color-paper-2);
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
  width: 3.5rem;
  height: 3.5rem;
}

.brand__name {
  font-family: var(--font-outlier);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-ink);
}

.brand__lede {
  max-width: 24ch;
  margin: var(--space-lg) 0 0;
  font-family: var(--font-outlier);
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 600;
  line-height: 1.15;
  color: var(--color-ink);
}

.brand__sub {
  margin: 0;
  color: var(--color-ink-2);
}

.brand__chart {
  width: 100%;
  max-width: 30rem;
  margin-top: var(--space-xl);
  overflow: visible;
}

.chart__zero {
  stroke: var(--color-rule-strong);
  stroke-dasharray: 4 5;
}

.chart__label,
.chart__axis {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: var(--color-muted);
}

.chart__interval {
  stroke-width: 3;
  stroke-linecap: round;
}

.chart__interval.is-better {
  stroke: var(--color-better);
}

.chart__interval.is-worse {
  stroke: var(--color-worse);
}

.chart__estimate.is-better {
  fill: var(--color-better);
}

.chart__estimate.is-worse {
  fill: var(--color-worse);
}

.brand__caption {
  max-width: 34ch;
  margin: 0;
  font-size: var(--text-sm);
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
