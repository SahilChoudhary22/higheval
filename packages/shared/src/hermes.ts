import { z } from 'zod';
import { slugSchema } from './common.js';

/** One of Hermes' built-in ("bundled") skills, as listed by `GET /api/hermes/skills`. */
export const bundledSkillSchema = z.object({
  name: slugSchema,
  /** Directory the skill lives in under Hermes' `skills/`, e.g. `productivity`. */
  category: z.string().min(1),
  description: z.string(),
  /** Operating systems the skill loads on (`macos`, `linux`, `windows`); empty means all. */
  platforms: z.array(z.string()),
});
export type BundledSkill = z.infer<typeof bundledSkillSchema>;

export const bundledSkillCatalogSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    /** Pinned Hermes commit the skills were read from. */
    hermesCommit: z.string(),
    skills: z.array(bundledSkillSchema),
  }),
  /** Hermes is not installed, so there is nothing to list. */
  z.object({
    status: z.literal('unavailable'),
    message: z.string(),
    skills: z.array(bundledSkillSchema).max(0),
  }),
]);
export type BundledSkillCatalog = z.infer<typeof bundledSkillCatalogSchema>;
