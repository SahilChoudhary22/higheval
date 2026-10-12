import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded']);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    /** Providers with a key (saved in Settings or in `.env`). */
    configuredProviders: z.array(z.string()),
    /** Pinned Hermes runtime installed by `pnpm setup:hermes`, or null if missing. */
    hermesVersion: z.string().nullable(),
  }),
  /** Agent runs executed in parallel; used by the UI to estimate durations. */
  maxConcurrentRuns: z.int().positive(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
