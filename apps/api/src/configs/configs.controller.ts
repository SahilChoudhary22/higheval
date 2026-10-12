import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { agentConfigInputSchema, agentConfigSchema, type AgentConfig } from '@higheval/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { ConfigsService, type AgentConfigData } from './configs.service.js';

@Controller('configs')
export class ConfigsController {
  constructor(private readonly configs: ConfigsService) {}

  @Get()
  @ApiDoc({ summary: 'List configurations', response: z.array(agentConfigSchema) })
  list(): AgentConfig[] {
    return this.configs.list();
  }

  @Get(':id')
  @ApiDoc({
    summary: 'Get a configuration',
    response: agentConfigSchema,
    params: { id: 'Configuration ID' },
  })
  get(@Param('id') id: string): AgentConfig {
    return this.configs.get(id);
  }

  @Post()
  @ApiDoc({
    summary: 'Create a configuration',
    body: agentConfigInputSchema,
    response: agentConfigSchema,
  })
  create(@Body(new ZodValidationPipe(agentConfigInputSchema)) input: AgentConfigData): AgentConfig {
    return this.configs.create(input);
  }

  @Put(':id')
  @ApiDoc({
    summary: 'Replace a configuration',
    description: 'Experiments already launched keep their own snapshot.',
    body: agentConfigInputSchema,
    response: agentConfigSchema,
    params: { id: 'Configuration ID' },
  })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(agentConfigInputSchema)) input: AgentConfigData,
  ): AgentConfig {
    return this.configs.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiDoc({ summary: 'Delete a configuration', params: { id: 'Configuration ID' } })
  remove(@Param('id') id: string): void {
    this.configs.remove(id);
  }
}
