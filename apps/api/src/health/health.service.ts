import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@higheval/shared';
import type { Env } from '../config/env.schema.js';
import { APP_VERSION } from '../config/version.js';

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  check(): HealthResponse {
    const providerConfigured = this.config.get('OPENROUTER_API_KEY', { infer: true }) !== undefined;
    return {
      status: providerConfigured ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
