import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import {
  agentConfigSchema,
  type AgentConfig,
  type agentConfigInputSchema,
  type BundledSkills,
  type ConfigSnapshot,
  type Skill,
} from '@higheval/shared';
import type { z } from 'zod';
import { sha256Hex } from '../common/hash.js';
import { newId, nowIso } from '../common/ids.js';
import { validationError } from '../common/validation-error.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { agentConfigs } from '../database/schema.js';
import {
  BundledSkillsService,
  type BundledSkillsResolved,
} from '../execution/hermes/bundled-skills.service.js';
import { SkillsService } from '../skills/skills.service.js';

export type AgentConfigData = z.output<typeof agentConfigInputSchema>;
type AgentConfigRow = typeof agentConfigs.$inferSelect;

@Injectable()
export class ConfigsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly skills: SkillsService,
    private readonly bundledSkills: BundledSkillsService,
  ) {}

  list(): AgentConfig[] {
    // Creation order, with rowid as a tie-break for rows created in the same millisecond.
    return this.db
      .select()
      .from(agentConfigs)
      .orderBy(asc(agentConfigs.createdAt), asc(sql`rowid`))
      .all()
      .map(toConfig);
  }

  get(id: string): AgentConfig {
    const row = this.db.select().from(agentConfigs).where(eq(agentConfigs.id, id)).get();
    if (!row) throw new NotFoundException(`Configuration ${id} not found`);
    return toConfig(row);
  }

  create(input: AgentConfigData): AgentConfig {
    this.resolveSkills(input);
    const timestamp = nowIso();
    const config: AgentConfig = {
      id: newId(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db.insert(agentConfigs).values(toRow(config)).run();
    return config;
  }

  update(id: string, input: AgentConfigData): AgentConfig {
    const existing = this.get(id);
    this.resolveSkills(input);
    const config: AgentConfig = { ...existing, ...input, updatedAt: nowIso() };
    this.db.update(agentConfigs).set(toRow(config)).where(eq(agentConfigs.id, id)).run();
    return config;
  }

  remove(id: string): void {
    this.get(id);
    this.db.delete(agentConfigs).where(eq(agentConfigs.id, id)).run();
  }

  /**
   * Resolves a configuration into an immutable snapshot with skill contents
   * inlined and built-in skills pinned to the installed Hermes, plus a hash
   * over every field that can change agent behavior.
   */
  snapshot(id: string): ConfigSnapshot {
    const config = this.get(id);
    const resolved = this.resolveSkills(config);
    const skills = resolved.skills.map(({ name, description, content }) => ({
      name,
      description,
      content,
    }));
    const { bundledSkills, hermesCommit } = resolved;
    const behavior = {
      model: config.model,
      skills,
      // The mode is left out: "all" and selecting every skill behave identically.
      bundledSkills: { names: bundledSkills.names, contentHash: bundledSkills.contentHash },
      hermesCommit: hermesCommit ?? null,
      memory: config.memory,
      // Added only when set, so agents without them keep the hashes they had before these existed.
      ...(config.soul === null ? {} : { soul: config.soul }),
      ...(config.instructions === null ? {} : { instructions: config.instructions }),
      toolsets: config.toolsets.toSorted(),
      maxTurns: config.maxTurns,
      timeoutSeconds: config.timeoutSeconds,
    };
    return {
      id: config.id,
      name: config.name,
      description: config.description,
      model: config.model,
      skills,
      bundledSkills,
      ...(hermesCommit === undefined ? {} : { hermesCommit }),
      memory: config.memory,
      soul: config.soul,
      instructions: config.instructions,
      toolsets: config.toolsets,
      maxTurns: config.maxTurns,
      timeoutSeconds: config.timeoutSeconds,
      hash: sha256Hex(behavior),
    };
  }

  /**
   * Loads the configuration's skills and resolves its built-in skills against
   * the installed Hermes, rejecting selections that cannot be honoured.
   */
  private resolveSkills(config: {
    skillIds: readonly string[];
    bundledSkills: BundledSkills;
  }): BundledSkillsResolved & { skills: Skill[] } {
    const skills = this.skills.getMany(config.skillIds);
    const resolved = this.bundledSkills.resolve(config.bundledSkills);
    // Same-named skills would make Hermes' index and --skills preload ambiguous.
    const clashes = skills.filter((skill) => resolved.bundledSkills.names.includes(skill.name));
    if (clashes.length > 0) {
      throw validationError(
        clashes.map((skill) => ({
          path: 'bundledSkills',
          message: `Skill "${skill.name}" has the same name as a Hermes built-in skill; rename it or leave that built-in skill out`,
        })),
      );
    }
    return { ...resolved, skills };
  }
}

function toConfig(row: AgentConfigRow): AgentConfig {
  const { provider, model, ...rest } = row;
  // Parsed so agents saved before newer settings existed get their defaults, and hash consistently.
  return agentConfigSchema.parse({ ...rest, model: { provider, model } });
}

function toRow(config: AgentConfig): AgentConfigRow {
  const { model, ...rest } = config;
  return { ...rest, provider: model.provider, model: model.model };
}
