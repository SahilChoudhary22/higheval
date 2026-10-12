import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { agentConfigInputSchema, type AgentConfig } from '@higheval/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ConfigsService, type AgentConfigData } from './configs.service.js';

@Controller('configs')
export class ConfigsController {
  constructor(private readonly configs: ConfigsService) {}

  @Get()
  list(): AgentConfig[] {
    return this.configs.list();
  }

  @Get(':id')
  get(@Param('id') id: string): AgentConfig {
    return this.configs.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(agentConfigInputSchema)) input: AgentConfigData): AgentConfig {
    return this.configs.create(input);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(agentConfigInputSchema)) input: AgentConfigData,
  ): AgentConfig {
    return this.configs.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    this.configs.remove(id);
  }
}
