import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROVIDER_IDS, PROVIDERS, type ProviderId, type ProviderStatus } from '@higheval/shared';
import { eq } from 'drizzle-orm';
import type { Env } from '../config/env.schema.js';
import { nowIso } from '../common/ids.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { providerKeys } from '../database/schema.js';

/**
 * Provider API keys for everything that calls a model provider (the agent
 * executor and the LLM judge). Keys saved from the UI take precedence over
 * `.env`; keys are never returned by the API, only a four-character hint.
 */
@Injectable()
export class ProviderCredentials {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
  ) {}

  key(provider: ProviderId): string | undefined {
    return this.savedKey(provider)?.apiKey ?? this.environmentKey(provider);
  }

  statuses(): ProviderStatus[] {
    return PROVIDER_IDS.map((id) => {
      const saved = this.savedKey(id);
      const environment = this.environmentKey(id);
      const key = saved?.apiKey ?? environment;
      const info = PROVIDERS[id];
      return {
        id,
        name: info.name,
        keyEnvVar: info.keyEnvVar,
        keysUrl: info.keysUrl,
        modelExample: info.modelExample,
        configured: key !== undefined,
        source: saved ? 'settings' : environment === undefined ? null : 'environment',
        keyHint: key === undefined ? null : `…${key.slice(-4)}`,
        updatedAt: saved?.updatedAt ?? null,
      };
    });
  }

  save(provider: ProviderId, apiKey: string): void {
    const updatedAt = nowIso();
    this.db
      .insert(providerKeys)
      .values({ provider, apiKey, updatedAt })
      .onConflictDoUpdate({ target: providerKeys.provider, set: { apiKey, updatedAt } })
      .run();
  }

  remove(provider: ProviderId): void {
    this.db.delete(providerKeys).where(eq(providerKeys.provider, provider)).run();
  }

  private savedKey(provider: ProviderId): { apiKey: string; updatedAt: string } | undefined {
    return this.db
      .select({ apiKey: providerKeys.apiKey, updatedAt: providerKeys.updatedAt })
      .from(providerKeys)
      .where(eq(providerKeys.provider, provider))
      .get();
  }

  private environmentKey(provider: ProviderId): string | undefined {
    return this.config.get(PROVIDERS[provider].keyEnvVar, { infer: true });
  }
}
