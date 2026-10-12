import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  providerIdSchema,
  providerKeyInputSchema,
  type ProviderId,
  type ProviderStatus,
  type ProviderTestResult,
} from '@higheval/shared';
import type { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProviderCredentials } from './provider-credentials.service.js';
import { ProviderKeyTester } from './provider-key-tester.js';

@Controller('providers')
export class ProvidersController {
  constructor(
    private readonly credentials: ProviderCredentials,
    private readonly tester: ProviderKeyTester,
  ) {}

  @Get()
  list(): ProviderStatus[] {
    return this.credentials.statuses();
  }

  /** Saves a key, verifying it with the provider first. Returns the verification result. */
  @Put(':id/key')
  async save(
    @Param('id', new ZodValidationPipe(providerIdSchema)) id: ProviderId,
    @Body(new ZodValidationPipe(providerKeyInputSchema))
    input: z.output<typeof providerKeyInputSchema>,
  ): Promise<ProviderTestResult> {
    const result = await this.tester.test(id, input.apiKey);
    // A rejected key is not saved; an unverifiable one is (the provider may just be unreachable).
    if (result.status === 'rejected') {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: [{ path: 'apiKey', message: result.message }],
      });
    }
    this.credentials.save(id, input.apiKey);
    return result;
  }

  @Delete(':id/key')
  @HttpCode(204)
  remove(@Param('id', new ZodValidationPipe(providerIdSchema)) id: ProviderId): void {
    this.credentials.remove(id);
  }

  @Post(':id/test')
  @HttpCode(200)
  async test(
    @Param('id', new ZodValidationPipe(providerIdSchema)) id: ProviderId,
  ): Promise<ProviderTestResult> {
    const key = this.credentials.key(id);
    if (!key) return { status: 'unverified', message: 'No key is configured for this provider.' };
    return this.tester.test(id, key);
  }
}
