import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { agentConfigInputSchema, skillInputSchema, suiteInputSchema } from '@higheval/shared';
import type { Env } from '../config/env.schema.js';
import { ConfigsService } from '../configs/configs.service.js';
import { SkillsService } from '../skills/skills.service.js';
import { SuitesService } from '../suites/suites.service.js';
import { AGENCY_OPS_SUITE } from './agency-ops-suite.js';
import {
  DATA_TASK_CHECKLIST_SKILL,
  SAMPLE_CONFIGS,
  SAMPLE_SKILL_CONFIG,
} from './sample-definitions.js';

/**
 * Seeds the sample suite, skill and configurations into an empty database so
 * the platform is usable on first start. Never touches a database that already
 * has suites, so user edits and deletions are respected.
 */
@Injectable()
export class SampleSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SampleSeeder.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly suites: SuitesService,
    private readonly skills: SkillsService,
    private readonly configs: ConfigsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('SEED_SAMPLES', { infer: true }) || this.suites.list().length > 0) return;
    this.suites.create(suiteInputSchema.parse(AGENCY_OPS_SUITE));
    const skill = this.skills.create(skillInputSchema.parse(DATA_TASK_CHECKLIST_SKILL));
    for (const input of [...SAMPLE_CONFIGS, SAMPLE_SKILL_CONFIG(skill.id)]) {
      this.configs.create(agentConfigInputSchema.parse(input));
    }
    this.logger.log('Seeded sample suite, skill and configurations');
  }
}
