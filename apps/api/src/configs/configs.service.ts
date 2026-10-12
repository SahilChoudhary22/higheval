import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { AgentConfig, agentConfigInputSchema, ConfigSnapshot } from '@higheval/shared';
import type { z } from 'zod';
import { sha256Hex } from '../common/hash.js';
import { newId, nowIso } from '../common/ids.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { agentConfigs } from '../database/schema.js';
import { SkillsService } from '../skills/skills.service.js';

export type AgentConfigData = z.output<typeof agentConfigInputSchema>;
type AgentConfigRow = typeof agentConfigs.$inferSelect;

@Injectable()
export class ConfigsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly skills: SkillsService,
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
    this.skills.getMany(input.skillIds);
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
    this.skills.getMany(input.skillIds);
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
   * inlined, plus a hash over every field that can change agent behavior.
   */
  snapshot(id: string): ConfigSnapshot {
    const config = this.get(id);
    const skills = this.skills
      .getMany(config.skillIds)
      .map(({ name, description, content }) => ({ name, description, content }));
    const behavior = {
      model: config.model,
      skills,
      memory: config.memory,
      toolsets: config.toolsets.toSorted(),
      maxTurns: config.maxTurns,
      timeoutSeconds: config.timeoutSeconds,
    };
    return {
      id: config.id,
      name: config.name,
      description: config.description,
      ...behavior,
      toolsets: config.toolsets,
      hash: sha256Hex(behavior),
    };
  }
}

function toConfig(row: AgentConfigRow): AgentConfig {
  const { provider, model, ...rest } = row;
  return { ...rest, model: { provider, model } };
}

function toRow(config: AgentConfig): AgentConfigRow {
  const { model, ...rest } = config;
  return { ...rest, provider: model.provider, model: model.model };
}
