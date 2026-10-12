import { Controller, Get } from '@nestjs/common';
import type { BundledSkillCatalog } from '@higheval/shared';
import { BundledSkillsService } from './bundled-skills.service.js';

@Controller('hermes')
export class HermesController {
  constructor(private readonly bundledSkills: BundledSkillsService) {}

  /** Built-in skills a configuration can opt into; empty when Hermes is not installed. */
  @Get('skills')
  skills(): BundledSkillCatalog {
    return this.bundledSkills.catalog();
  }
}
