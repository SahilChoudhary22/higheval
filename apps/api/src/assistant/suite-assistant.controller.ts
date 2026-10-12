import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { suiteDraftRequestSchema, suiteDraftSchema, type SuiteDraft } from '@higheval/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { SuiteAssistantService, type SuiteDraftData } from './suite-assistant.service.js';

@Controller('suite-drafts')
export class SuiteAssistantController {
  constructor(private readonly assistant: SuiteAssistantService) {}

  @Post()
  @HttpCode(202)
  @ApiDoc({
    summary: 'Ask Hermes to draft (or revise) a suite',
    description:
      'Starts a Hermes run that writes a suite from the description, then checks it against the suite schema and its own reference solutions, retrying with the problems found. Poll the returned draft; nothing is saved until you save the suite yourself.',
    body: suiteDraftRequestSchema,
    response: suiteDraftSchema,
  })
  start(@Body(new ZodValidationPipe(suiteDraftRequestSchema)) input: SuiteDraftData): SuiteDraft {
    return this.assistant.start(input);
  }

  @Get(':id')
  @ApiDoc({
    summary: 'Get a suite draft and its progress',
    response: suiteDraftSchema,
    params: { id: 'Draft ID' },
  })
  get(@Param('id') id: string): SuiteDraft {
    return this.assistant.get(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Stop a running draft',
    response: suiteDraftSchema,
    params: { id: 'Draft ID' },
  })
  cancel(@Param('id') id: string): SuiteDraft {
    return this.assistant.cancel(id);
  }
}
