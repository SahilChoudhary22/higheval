import { Injectable } from '@nestjs/common';
import { PROVIDERS, type ProviderId, type ProviderTestResult } from '@higheval/shared';

const TIMEOUT_MS = 10_000;

/** A cheap authenticated read per provider, used only to check that a key works. */
const CHECKS: Record<
  ProviderId,
  (key: string) => { url: string; headers: Record<string, string> }
> = {
  openrouter: (key) => ({
    url: 'https://openrouter.ai/api/v1/key',
    headers: { Authorization: `Bearer ${key}` },
  }),
  'openai-api': (key) => ({
    url: 'https://api.openai.com/v1/models',
    headers: { Authorization: `Bearer ${key}` },
  }),
  anthropic: (key) => ({
    url: 'https://api.anthropic.com/v1/models',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  }),
  // The key goes in a header, never the URL, so it cannot end up in logs.
  gemini: (key) => ({
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: { 'x-goog-api-key': key },
  }),
  deepseek: (key) => ({
    url: 'https://api.deepseek.com/models',
    headers: { Authorization: `Bearer ${key}` },
  }),
  xai: (key) => ({
    url: 'https://api.x.ai/v1/models',
    headers: { Authorization: `Bearer ${key}` },
  }),
  nvidia: (key) => ({
    url: 'https://integrate.api.nvidia.com/v1/models',
    headers: { Authorization: `Bearer ${key}` },
  }),
};

@Injectable()
export class ProviderKeyTester {
  async test(provider: ProviderId, key: string): Promise<ProviderTestResult> {
    const { url, headers } = CHECKS[provider](key);
    const name = PROVIDERS[provider].name;
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.ok) return { status: 'valid', message: `${name} accepted the key.` };
      if (response.status === 401 || response.status === 403) {
        return {
          status: 'rejected',
          message: `${name} rejected the key (HTTP ${String(response.status)}).`,
        };
      }
      return {
        status: 'unverified',
        message: `Could not verify the key: ${name} returned HTTP ${String(response.status)}.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        status: 'unverified',
        message: `Could not reach ${name} to verify the key: ${reason}`,
      };
    }
  }
}
