import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../config/env.schema.js';
import { openDatabase } from '../database/database.js';
import { ProviderCredentials } from './provider-credentials.service.js';

/** Real credentials over a fresh in-memory database, for unit tests. */
export function testCredentials(env: Record<string, unknown> = {}): {
  config: ConfigService<Env, true>;
  credentials: ProviderCredentials;
} {
  const config = new ConfigService<Env, true>(validateEnv(env));
  return { config, credentials: new ProviderCredentials(openDatabase(':memory:').db, config) };
}
