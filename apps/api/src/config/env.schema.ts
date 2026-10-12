import { resolve } from 'node:path';
import { modelIdSchema, providerIdSchema } from '@higheval/shared';
import { z } from 'zod';
import { LOOPBACK_HOSTS } from '../common/request-guard.js';
import { REPO_ROOT } from './paths.js';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  /**
   * Extra hostnames the API answers to besides localhost (comma-separated),
   * e.g. the public name of a tunnel. Requests for other hosts are rejected.
   */
  ALLOWED_HOSTS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  /** Holds the SQLite database and per-run working directories. */
  DATA_DIR: z.string().min(1).default(resolve(REPO_ROOT, 'data')),
  /** Written by scripts/setup-hermes.sh; tells the API how to launch the pinned Hermes. */
  HERMES_MANIFEST: z.string().min(1).default(resolve(REPO_ROOT, '.hermes-runtime/manifest.json')),
  /** Agent runs executed in parallel across all experiments. Free-tier providers rate-limit aggressively. */
  MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(16).default(4),
  /** Attempts per run when the failure is retryable infrastructure (e.g. HTTP 429). */
  MAX_RUN_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  /** Base delay before retrying a retryable failure; doubles each attempt, and rate limits wait 4× as long. */
  RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(15_000),
  /** Seed the sample suite, skill and configurations into an empty database. */
  SEED_SAMPLES: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** First retry delay for LLM-judge calls that hit a rate limit; doubles each attempt. */
  JUDGE_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(2_000),
  /** Model the suite assistant (Hermes) drafts suites with. Its provider needs a key. */
  ASSISTANT_PROVIDER: providerIdSchema.default('openrouter'),
  ASSISTANT_MODEL: modelIdSchema.default('nvidia/nemotron-3-super-120b-a12b:free'),
  /**
   * Provider keys. All optional: keys can also be saved in the UI (Settings),
   * which take precedence. The UI starts without any and explains what is missing.
   */
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  XAI_API_KEY: z.string().min(1).optional(),
  NVIDIA_API_KEY: z.string().min(1).optional(),
  /**
   * Sign-in for hosted deployments. Set both to require a login for the UI and
   * API; leave both unset for local use. Required when HOST is not loopback.
   */
  AUTH_USERNAME: z.string().min(1).max(200).optional(),
  AUTH_PASSWORD: z.string().min(1).max(200).optional(),
  /** Signs session cookies. Optional: without it, sessions end when the server restarts. */
  SESSION_SECRET: z.string().min(32, 'Use at least 32 characters').optional(),
  /** Hide the key editor in Settings, so visitors to a hosted demo cannot change provider keys. */
  PROVIDER_KEYS_READ_ONLY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by `ConfigModule` to fail fast on invalid configuration. */
export function validateEnv(raw: Record<string, unknown>): Env {
  // Blank values (e.g. `OPENROUTER_API_KEY=` copied from .env.example) mean "unset".
  const present = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const result = envSchema
    .superRefine((env, context) => {
      if ((env.AUTH_USERNAME === undefined) !== (env.AUTH_PASSWORD === undefined)) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_PASSWORD'],
          message: 'Set both AUTH_USERNAME and AUTH_PASSWORD, or neither',
        });
      }
      // The API launches agents that run tools on this machine: never expose it without a login.
      if (!(LOOPBACK_HOSTS as readonly string[]).includes(env.HOST) && !env.AUTH_USERNAME) {
        context.addIssue({
          code: 'custom',
          path: ['HOST'],
          message: `HOST=${env.HOST} makes the API reachable from other machines; set AUTH_USERNAME and AUTH_PASSWORD to require a login`,
        });
      }
    })
    .safeParse(present);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
