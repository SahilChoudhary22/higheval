import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Skill, skillInputSchema } from '@higheval/shared';
import type { z } from 'zod';
import { newId, nowIso } from '../common/ids.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { agentConfigs, skills } from '../database/schema.js';

export type SkillData = z.output<typeof skillInputSchema>;

@Injectable()
export class SkillsService {
  constructor(@InjectDb() private readonly db: Db) {}

  list(): Skill[] {
    return this.db.select().from(skills).orderBy(skills.name).all();
  }

  get(id: string): Skill {
    const skill = this.db.select().from(skills).where(eq(skills.id, id)).get();
    if (!skill) throw new NotFoundException(`Skill ${id} not found`);
    return skill;
  }

  create(input: SkillData): Skill {
    this.assertNameAvailable(input.name);
    const timestamp = nowIso();
    const skill: Skill = { id: newId(), ...input, createdAt: timestamp, updatedAt: timestamp };
    this.db.insert(skills).values(skill).run();
    return skill;
  }

  update(id: string, input: SkillData): Skill {
    const existing = this.get(id);
    this.assertNameAvailable(input.name, id);
    const skill: Skill = { ...existing, ...input, updatedAt: nowIso() };
    this.db.update(skills).set(skill).where(eq(skills.id, id)).run();
    return skill;
  }

  remove(id: string): void {
    this.get(id);
    const inUse = this.db
      .select({ name: agentConfigs.name, skillIds: agentConfigs.skillIds })
      .from(agentConfigs)
      .all()
      .filter((config) => config.skillIds.includes(id));
    if (inUse.length > 0) {
      throw new ConflictException(
        `Skill is used by configuration(s): ${inUse.map((config) => config.name).join(', ')}`,
      );
    }
    this.db.delete(skills).where(eq(skills.id, id)).run();
  }

  /** Returns the skills with these IDs, preserving order; throws if any is missing. */
  getMany(ids: readonly string[]): Skill[] {
    return ids.map((id) => this.get(id));
  }

  private assertNameAvailable(name: string, exceptId?: string): void {
    const clash = this.db.select().from(skills).where(eq(skills.name, name)).get();
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(`A skill named "${name}" already exists`);
    }
  }
}
