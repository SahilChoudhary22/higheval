import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { skillInputSchema, type Skill } from '@higheval/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SkillsService, type SkillData } from './skills.service.js';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(): Skill[] {
    return this.skills.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Skill {
    return this.skills.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(skillInputSchema)) input: SkillData): Skill {
    return this.skills.create(input);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(skillInputSchema)) input: SkillData,
  ): Skill {
    return this.skills.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.skills.remove(id);
  }
}
