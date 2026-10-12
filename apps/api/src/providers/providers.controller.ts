import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  providerIdSchema,
  providerKeyInputSchema,
  providerStatusSchema,
  providerTestResultSchema,
  type ProviderId,
  type ProviderStatus,
  type ProviderTestResult,
} from '@higheval/shared';
import { z } from 'zod';
import { validationError } from '../common/validation-error.js';
import type { Env } from '../config/env.schema.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { ProviderCredentials } from './provider-credentials.service.js';
import { ProviderKeyTester } from './provider-key-tester.js';

@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly credentials: ProviderCredentials,
    private readonly tester: ProviderKeyTester,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Hosted demos manage keys centrally, so visitors cannot change or remove them. */
  private assertEditable(): void {
    if (this.config.get('PROVIDER_KEYS_READ_ONLY', { infer: true })) {
      throw new ForbiddenException(
        'Provider keys are managed by the administrator on this deployment',
      );
    }
  }

  @Get()
  @ApiDoc({
    summary: 'List providers and whether each has a key',
    description: 'Keys are never returned, only their last four characters.',
    response: z.array(providerStatusSchema),
  })
  list(): ProviderStatus[] {
    return this.credentials.statuses();
  }

  /** Saves a key, verifying it with the provider first. Returns the verification result. */
  @Put(':id/key')
  @ApiDoc({
    summary: 'Verify and save a provider key',
    description:
      'The key is checked with the provider first. A rejected key is not saved (400); one that cannot be verified is saved and reported as unverified. Refused (403) when PROVIDER_KEYS_READ_ONLY is set.',
    body: providerKeyInputSchema,
    response: providerTestResultSchema,
    params: { id: 'Provider ID' },
  })
  async save(
    @Param('id', new ZodValidationPipe(providerIdSchema)) id: ProviderId,
    @Body(new ZodValidationPipe(providerKeyInputSchema))
    input: z.output<typeof providerKeyInputSchema>,
  ): Promise<ProviderTestResult> {
    this.assertEditable();
    const result = await this.tester.test(id, input.apiKey);
    // A rejected key is not saved; an unverifiable one is (the provider may just be unreachable).
    if (result.status === 'rejected') {
      throw validationError([{ path: 'apiKey', message: result.message }]);
    }
    this.credentials.save(id, input.apiKey);
    return result;
  }

  @Delete(':id/key')
  @HttpCode(204)
  @ApiDoc({
    summary: 'Remove a saved provider key',
    description:
      'A key from .env, if any, applies again. Refused (403) when PROVIDER_KEYS_READ_ONLY is set.',
    params: { id: 'Provider ID' },
  })
  remove(@Param('id', new ZodValidationPipe(providerIdSchema)) id: ProviderId): void {
    this.assertEditable();
    this.credentials.remove(id);
  }

  @Post(':id/test')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Check the current key with the provider',
    response: providerTestResultSchema,
    params: { id: 'Provider ID' },
  })
  async test(
    @Param('id', new ZodValidationPipe(providerIdSchema)) id: ProviderId,
  ): Promise<ProviderTestResult> {
    const key = this.credentials.key(id);
    if (!key) return { status: 'unverified', message: 'No key is configured for this provider.' };
    return this.tester.test(id, key);
  }
}
