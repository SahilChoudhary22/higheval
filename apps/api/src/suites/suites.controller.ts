import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  suiteInputSchema,
  suiteSchema,
  suiteSummarySchema,
  type Suite,
  type SuiteSummary,
} from '@higheval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { SuitesService, type SuiteData } from './suites.service.js';

@Controller('suites')
export class SuitesController {
  constructor(private readonly suites: SuitesService) {}

  @Get()
  @ApiDoc({ summary: 'List suites', response: z.array(suiteSummarySchema) })
  list(): SuiteSummary[] {
    return this.suites.list();
  }

  @Get(':id')
  @ApiDoc({
    summary: 'Get a suite with its tasks and scorers',
    response: suiteSchema,
    params: { id: 'Suite ID' },
  })
  get(@Param('id') id: string): Suite {
    return this.suites.get(id);
  }

  @Post()
  @ApiDoc({ summary: 'Create a suite', body: suiteInputSchema, response: suiteSchema })
  create(@Body(new ZodValidationPipe(suiteInputSchema)) input: SuiteData): Suite {
    return this.suites.create(input);
  }

  @Put(':id')
  @ApiDoc({
    summary: 'Replace a suite',
    description: 'Experiments already launched keep their own snapshot of the tasks.',
    body: suiteInputSchema,
    response: suiteSchema,
    params: { id: 'Suite ID' },
  })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suiteInputSchema)) input: SuiteData,
  ): Suite {
    return this.suites.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiDoc({ summary: 'Delete a suite', params: { id: 'Suite ID' } })
  remove(@Param('id') id: string): void {
    this.suites.remove(id);
  }
}
