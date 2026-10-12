import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

/** Provides model-provider API keys to the components that call providers. */
@Injectable()
export class ProviderCredentials {
  constructor(private readonly config: ConfigService<Env, true>) {}

  openRouterKey(): string | undefined {
    return this.config.get('OPENROUTER_API_KEY', { infer: true });
  }
}
