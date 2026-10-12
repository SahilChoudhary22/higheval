import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@higheval/shared';
import type { Env } from '../config/env.schema.js';
import { APP_VERSION } from '../config/version.js';
import { loadHermesRuntime } from '../execution/hermes/hermes-runtime.js';

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  check(): HealthResponse {
    const providerKey = this.config.get('OPENROUTER_API_KEY', { infer: true }) !== undefined;
    const hermes = loadHermesRuntime(this.config.get('HERMES_MANIFEST', { infer: true }));
    return {
      status: providerKey && hermes ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { providerKey, hermesVersion: hermes?.version ?? null },
      maxConcurrentRuns: this.config.get('MAX_CONCURRENT_RUNS', { infer: true }),
    };
  }
}
