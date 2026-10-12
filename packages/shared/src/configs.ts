import { z } from 'zod';
import { idSchema, slugSchema, timestampSchema } from './common.js';

export const skillInputSchema = z.object({
  name: slugSchema,
  description: z.string().min(1).max(500),
  /** Markdown body of SKILL.md (without frontmatter). */
  content: z.string().min(1).max(50_000),
});
export type SkillInput = z.input<typeof skillInputSchema>;

export const skillSchema = skillInputSchema.extend({
  id: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Skill = z.infer<typeof skillSchema>;

export const memorySettingsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('disabled') }),
  /** Memory is enabled and pre-populated with these entries for every run. */
  z.object({
    mode: z.literal('seeded'),
    entries: z.array(z.string().min(1).max(2_000)).min(1).max(50),
  }),
]);
export type MemorySettings = z.infer<typeof memorySettingsSchema>;

export const modelSettingsSchema = z.object({
  provider: z.literal('openrouter'),
  /** Exact provider model ID; never a router alias, so results stay attributable. */
  model: z.string().min(1).max(200),
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;

/**
 * Hermes toolsets exposed by the platform. Limited to tools that work offline
 * in the run's working directory, so results do not depend on third-party
 * accounts. `code_execution` is omitted because Hermes denies it in
 * non-interactive runs; skills and memory have their own settings.
 */
export const toolsetSchema = z.enum(['file', 'terminal', 'todo']);
export type Toolset = z.infer<typeof toolsetSchema>;

export const agentConfigInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).default(''),
  model: modelSettingsSchema,
  /** Skill IDs made available to (and preloaded for) the agent. */
  skillIds: z
    .array(idSchema)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Skills must be unique')
    .default([]),
  memory: memorySettingsSchema.default({ mode: 'disabled' }),
  /** Hermes toolsets the agent may use. Empty means no tools. */
  toolsets: z
    .array(toolsetSchema)
    .max(toolsetSchema.options.length)
    .refine((toolsets) => new Set(toolsets).size === toolsets.length, 'Toolsets must be unique')
    .default([]),
  maxTurns: z.int().min(1).max(100).default(15),
  /** Wall-clock budget per run. */
  timeoutSeconds: z.int().min(10).max(1_800).default(240),
});
export type AgentConfigInput = z.input<typeof agentConfigInputSchema>;

export const agentConfigSchema = agentConfigInputSchema.extend({
  id: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;

/**
 * Fully resolved, self-contained configuration captured when an experiment
 * starts. Skill contents are inlined so later edits cannot change history.
 */
export const configSnapshotSchema = agentConfigSchema
  .omit({ skillIds: true, createdAt: true, updatedAt: true })
  .extend({
    skills: z.array(skillInputSchema),
    /** SHA-256 over every behavior-affecting field. */
    hash: z.string().length(64),
  });
export type ConfigSnapshot = z.infer<typeof configSnapshotSchema>;
