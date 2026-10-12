import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { skillInputSchema, skillSchema, type Skill } from '@higheval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { SkillsService, type SkillData } from './skills.service.js';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  @ApiDoc({ summary: 'List skills', response: z.array(skillSchema) })
  list(): Skill[] {
    return this.skills.list();
  }

  @Get(':id')
  @ApiDoc({ summary: 'Get a skill', response: skillSchema, params: { id: 'Skill ID' } })
  get(@Param('id') id: string): Skill {
    return this.skills.get(id);
  }

  @Post()
  @ApiDoc({ summary: 'Create a skill', body: skillInputSchema, response: skillSchema })
  create(@Body(new ZodValidationPipe(skillInputSchema)) input: SkillData): Skill {
    return this.skills.create(input);
  }

  @Put(':id')
  @ApiDoc({
    summary: 'Replace a skill',
    body: skillInputSchema,
    response: skillSchema,
    params: { id: 'Skill ID' },
  })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(skillInputSchema)) input: SkillData,
  ): Skill {
    return this.skills.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiDoc({ summary: 'Delete a skill', params: { id: 'Skill ID' } })
  remove(@Param('id') id: string): void {
    this.skills.remove(id);
  }
}
