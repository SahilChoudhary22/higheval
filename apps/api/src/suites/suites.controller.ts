import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { suiteInputSchema, type Suite, type SuiteSummary } from '@higheval/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SuitesService, type SuiteData } from './suites.service.js';

@Controller('suites')
export class SuitesController {
  constructor(private readonly suites: SuitesService) {}

  @Get()
  list(): SuiteSummary[] {
    return this.suites.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Suite {
    return this.suites.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(suiteInputSchema)) input: SuiteData): Suite {
    return this.suites.create(input);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suiteInputSchema)) input: SuiteData,
  ): Suite {
    return this.suites.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.suites.remove(id);
  }
}
