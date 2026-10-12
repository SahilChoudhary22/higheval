import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { agentConfigInputSchema, skillInputSchema, suiteInputSchema } from '@higheval/shared';
import type { Env } from '../config/env.schema.js';
import { ConfigsService } from '../configs/configs.service.js';
import { SkillsService } from '../skills/skills.service.js';
import { SuitesService } from '../suites/suites.service.js';
import { AGENCY_OPS_SUITE } from './agency-ops-suite.js';
import {
  CLIENT_MEMORY_SUITE,
  FILE_READING_SUITE,
  HOUSE_STYLE_SKILL,
  HOUSE_STYLE_SUITE,
  SERVICE_CATALOG_SKILL,
  SERVICE_CATALOG_SUITE,
} from './capability-suites.js';
import { CUSTOMER_CONVERSATIONS_SUITE } from './customer-conversations-suite.js';
import { QUICK_CHECK_SUITE } from './quick-check-suite.js';
import {
  CAPABILITY_CONFIGS,
  DATA_TASK_CHECKLIST_SKILL,
  SAMPLE_CONFIGS,
  SAMPLE_SKILL_CONFIG,
} from './sample-definitions.js';

/**
 * Seeds the sample suites, skills and configurations into an empty database so
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
    this.suites.create(suiteInputSchema.parse(CUSTOMER_CONVERSATIONS_SUITE));
    for (const suite of [
      SERVICE_CATALOG_SUITE,
      HOUSE_STYLE_SUITE,
      CLIENT_MEMORY_SUITE,
      FILE_READING_SUITE,
    ]) {
      this.suites.create(suiteInputSchema.parse(suite));
    }
    // Created last so it is listed first and preselected when launching.
    this.suites.create(suiteInputSchema.parse(QUICK_CHECK_SUITE));
    const skill = this.skills.create(skillInputSchema.parse(DATA_TASK_CHECKLIST_SKILL));
    const catalog = this.skills.create(skillInputSchema.parse(SERVICE_CATALOG_SKILL));
    const emailStyle = this.skills.create(skillInputSchema.parse(HOUSE_STYLE_SKILL));
    for (const input of [
      ...SAMPLE_CONFIGS,
      SAMPLE_SKILL_CONFIG(skill.id),
      ...CAPABILITY_CONFIGS({ catalog: catalog.id, emailStyle: emailStyle.id }),
    ]) {
      this.configs.create(agentConfigInputSchema.parse(input));
    }
    this.logger.log('Seeded sample suites, skills and configurations');
  }
}
