import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  /** Optional at boot so the UI can start and explain what is missing. */
  OPENROUTER_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Used by `ConfigModule` to fail fast on invalid configuration. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
