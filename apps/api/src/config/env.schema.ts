import { resolve } from 'node:path';
import { z } from 'zod';
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
  MAX_RUN_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  /** Base delay before retrying a retryable failure; doubles each attempt. */
  RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(15_000),
  /** Seed the sample suite, skill and configurations into an empty database. */
  SEED_SAMPLES: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  /** First retry delay for LLM-judge calls that hit a rate limit; doubles each attempt. */
  JUDGE_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(2_000),
  /** Optional at boot so the UI can start and explain what is missing. */
  OPENROUTER_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Used by `ConfigModule` to fail fast on invalid configuration. */
export function validateEnv(raw: Record<string, unknown>): Env {
  // Blank values (e.g. `OPENROUTER_API_KEY=` copied from .env.example) mean "unset".
  const present = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(present);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
