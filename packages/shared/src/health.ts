import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded']);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    /** OPENROUTER_API_KEY is configured. */
    providerKey: z.boolean(),
    /** Pinned Hermes runtime installed by `pnpm setup:hermes`, or null if missing. */
    hermesVersion: z.string().nullable(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
