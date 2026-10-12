import { z } from 'zod';
import { idSchema, relativePathSchema, slugSchema, timestampSchema } from './common.js';
import { providerIdSchema } from './providers.js';

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

const memoryEntriesSchema = z.array(z.string().trim().min(1).max(2_000)).max(50);

/**
 * Hermes' built-in memory: two files of `§`-separated entries, loaded into the
 * system prompt once at the start of each run. Runs never write back, so both
 * agents in an experiment start from exactly what is configured here.
 */
export const memorySettingsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('disabled') }),
  z
    .object({
      mode: z.literal('seeded'),
      /** The agent's own notes (`memories/MEMORY.md`). */
      entries: memoryEntriesSchema,
      /** What the agent knows about its user (`memories/USER.md`). Absent on older agents. */
      userProfile: memoryEntriesSchema.default([]),
    })
    .refine((memory) => memory.entries.length + memory.userProfile.length > 0, {
      message: 'Add at least one memory entry or user-profile entry',
      path: ['entries'],
    }),
]);
export type MemorySettings = z.infer<typeof memorySettingsSchema>;

/**
 * Exact provider model ID. Router aliases (`openrouter/auto`, `openrouter/free`)
 * are rejected: they may pick a different model per request, which would make
 * a comparison meaningless.
 */
export const modelIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((model) => !model.toLowerCase().startsWith('openrouter/'), {
    message:
      'Use an exact model ID; router aliases like openrouter/auto can change models between runs',
  });

export const modelSettingsSchema = z.object({
  /** A provider from the registry; its key comes from Settings or `.env`. */
  provider: providerIdSchema,
  model: modelIdSchema,
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;

/** The pinned Hermes commit ships 58 built-in skills. */
const MAX_BUNDLED_SKILLS = 58;

/**
 * Which of Hermes' built-in ("bundled") skills each run gets. Off by default,
 * so a run sees only the skills its configuration names explicitly.
 */
export const bundledSkillsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('all') }),
  z.object({
    mode: z.literal('selected'),
    names: z
      .array(slugSchema)
      .min(1, 'Select at least one built-in skill')
      .max(MAX_BUNDLED_SKILLS)
      .refine((names) => new Set(names).size === names.length, 'Built-in skills must be unique'),
  }),
]);
export type BundledSkills = z.infer<typeof bundledSkillsSchema>;

/** A built-in skills setting resolved against the installed Hermes when an experiment starts. */
export const resolvedBundledSkillsSchema = z.object({
  mode: z.enum(['none', 'all', 'selected']),
  /** Every skill copied into each run (all of them for `all`), sorted. */
  names: z.array(slugSchema),
  /**
   * What is copied into each run's skills directory, relative to Hermes'
   * bundled skills root: skill directories and their category descriptions.
   */
  paths: z.array(relativePathSchema),
  /** SHA-256 over the copied files; null when nothing is copied. */
  contentHash: z.string().length(64).nullable(),
});
export type ResolvedBundledSkills = z.infer<typeof resolvedBundledSkillsSchema>;

/**
 * Hermes toolsets exposed by the platform. Limited to tools that work offline
 * in the run's working directory, so results do not depend on third-party
 * accounts. `code_execution` is omitted because Hermes denies it in
 * non-interactive runs; memory has its own setting. `skills` lets the agent
 * list and open the skills in its home on demand; runs with built-in skills
 * always get it, since an undiscoverable skill would be an unrecorded no-op.
 */
/**
 * Size limit for an agent's SOUL.md and AGENTS.md. Hermes truncates context
 * files only above 20,000 characters, so these are never cut.
 */
export const AGENT_FILE_MAX_CHARS = 20_000;
const agentFileSchema = z.string().trim().min(1).max(AGENT_FILE_MAX_CHARS).nullable();

export const toolsetSchema = z.enum(['file', 'terminal', 'todo', 'skills']);
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
  /** The agent's identity (Hermes' `SOUL.md`); null uses Hermes' built-in persona. */
  soul: agentFileSchema.default(null),
  /** Standing instructions (`AGENTS.md` in the run's working directory); null for none. */
  instructions: agentFileSchema.default(null),
  bundledSkills: bundledSkillsSchema.default({ mode: 'none' }),
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
  .omit({ skillIds: true, bundledSkills: true, createdAt: true, updatedAt: true })
  .extend({
    skills: z.array(skillInputSchema),
    /**
     * Built-in skills copied into every run. Absent on snapshots taken before
     * they were configurable, which ran without any.
     */
    bundledSkills: resolvedBundledSkillsSchema.optional(),
    /** Hermes commit installed at launch; absent if Hermes was not installed (or on older snapshots). */
    hermesCommit: z.string().optional(),
    /** SHA-256 over every behavior-affecting field. */
    hash: z.string().length(64),
  });
export type ConfigSnapshot = z.infer<typeof configSnapshotSchema>;
