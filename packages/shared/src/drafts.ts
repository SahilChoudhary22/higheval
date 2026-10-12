import { z } from 'zod';
import { idSchema, timestampSchema } from './common.js';
import { modelSettingsSchema } from './configs.js';
import { suiteInputSchema } from './suites.js';

/** Ask Hermes to write a suite (or revise one) from a plain-language description. */
export const suiteDraftRequestSchema = z.object({
  /** What the suite should test, in plain language. */
  description: z
    .string()
    .trim()
    .min(20, 'Describe what the suite should test in a sentence or two')
    .max(8_000),
  /** An existing suite to revise instead of starting from scratch. */
  suite: suiteInputSchema.optional(),
});
export type SuiteDraftRequest = z.input<typeof suiteDraftRequestSchema>;

/**
 * running: Hermes is writing or fixing the draft. ready: the draft passes the
 * suite schema (check `checks` for self-test results). failed: no valid draft
 * after every attempt, or the agent could not run. cancelled: stopped by the user.
 */
export const DRAFT_STATUSES = ['running', 'ready', 'failed', 'cancelled'] as const;
export const draftStatusSchema = z.enum(DRAFT_STATUSES);
export type DraftStatus = z.infer<typeof draftStatusSchema>;

/**
 * Self-test of one drafted task: its deterministic scorers are run against
 * the reference solution the agent wrote, which must score 1.
 */
export const draftCheckSchema = z.object({
  taskKey: z.string(),
  passed: z.boolean(),
  /** Why the reference solution failed, one line per failing scorer. */
  problems: z.array(z.string()),
});
export type DraftCheck = z.infer<typeof draftCheckSchema>;

export const suiteDraftSchema = z.object({
  id: idSchema,
  status: draftStatusSchema,
  description: z.string(),
  /** Whether this revises an existing suite. */
  revision: z.boolean(),
  /** The model writing the draft. */
  model: modelSettingsSchema,
  /** Current (or last) attempt, starting at 1. */
  attempt: z.int().positive(),
  maxAttempts: z.int().positive(),
  /** Recent agent actions, oldest first, for showing progress. */
  activity: z.array(z.object({ at: timestampSchema, text: z.string() })),
  /** The latest draft that passes the suite schema. */
  suite: suiteInputSchema.nullable(),
  checks: z.array(draftCheckSchema),
  error: z.string().nullable(),
  createdAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
});
export type SuiteDraft = z.infer<typeof suiteDraftSchema>;
