import { Controller, Get } from '@nestjs/common';
import { bundledSkillCatalogSchema, type BundledSkillCatalog } from '@higheval/shared';
import { ApiDoc } from '../../openapi/api-doc.decorator.js';
import { BundledSkillsService } from './bundled-skills.service.js';

@Controller('hermes')
export class HermesController {
  constructor(private readonly bundledSkills: BundledSkillsService) {}

  /** Built-in skills a configuration can opt into; empty when Hermes is not installed. */
  @Get('skills')
  @ApiDoc({
    summary: "List the pinned Hermes runtime's built-in skills",
    response: bundledSkillCatalogSchema,
  })
  skills(): BundledSkillCatalog {
    return this.bundledSkills.catalog();
  }
}
