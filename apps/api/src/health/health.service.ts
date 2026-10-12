import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@higheval/shared';
import type { Env } from '../config/env.schema.js';
import { APP_VERSION } from '../config/version.js';
import { loadHermesRuntime } from '../execution/hermes/hermes-runtime.js';
import { ProviderCredentials } from '../providers/provider-credentials.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly credentials: ProviderCredentials,
  ) {}

  check(): HealthResponse {
    const configuredProviders = this.credentials
      .statuses()
      .filter((provider) => provider.configured)
      .map((provider) => provider.id);
    const hermes = loadHermesRuntime(this.config.get('HERMES_MANIFEST', { infer: true }));
    return {
      status: configuredProviders.length > 0 && hermes ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { configuredProviders, hermesVersion: hermes?.version ?? null },
      maxConcurrentRuns: this.config.get('MAX_CONCURRENT_RUNS', { infer: true }),
    };
  }
}
