import { z } from 'zod';
import { timestampSchema } from './common.js';

/**
 * Model providers HighEval can run agents against. IDs and key variables
 * match the pinned Hermes provider registry (`hermes_cli/auth.py`), so a
 * configuration's provider is passed to Hermes unchanged.
 */
export const PROVIDER_IDS = [
  'openrouter',
  'openai-api',
  'anthropic',
  'gemini',
  'deepseek',
  'xai',
  'nvidia',
] as const;
export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Environment variables Hermes reads provider keys from. */
export type ProviderKeyEnvVar =
  | 'OPENROUTER_API_KEY'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GEMINI_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'XAI_API_KEY'
  | 'NVIDIA_API_KEY';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Environment variable Hermes reads the key from (also accepted in `.env`). */
  keyEnvVar: ProviderKeyEnvVar;
  /** Where to create a key. */
  keysUrl: string;
  /** An example model ID in this provider's own naming, shown as a placeholder. */
  modelExample: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    keyEnvVar: 'OPENROUTER_API_KEY',
    keysUrl: 'https://openrouter.ai/settings/keys',
    modelExample: 'nvidia/nemotron-3.5-lightning:free',
  },
  'openai-api': {
    id: 'openai-api',
    name: 'OpenAI',
    keyEnvVar: 'OPENAI_API_KEY',
    keysUrl: 'https://platform.openai.com/api-keys',
    modelExample: 'gpt-6.1-sol',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    keyEnvVar: 'ANTHROPIC_API_KEY',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    modelExample: 'claude-sonnet-5-5',
  },
  gemini: {
    id: 'gemini',
    name: 'Google AI Studio',
    keyEnvVar: 'GEMINI_API_KEY',
    keysUrl: 'https://aistudio.google.com/apikey',
    modelExample: 'gemini-3.8-flash',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    keyEnvVar: 'DEEPSEEK_API_KEY',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    modelExample: 'deepseek-v4.1-flash',
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    keyEnvVar: 'XAI_API_KEY',
    keysUrl: 'https://console.x.ai',
    modelExample: 'grok-4.7',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    keyEnvVar: 'NVIDIA_API_KEY',
    keysUrl: 'https://build.nvidia.com',
    modelExample: 'nvidia/nemotron-3.5-lightning',
  },
};

/** Where a provider's key comes from. Keys saved in the UI override `.env`. */
export const keySourceSchema = z.enum(['settings', 'environment']);
export type KeySource = z.infer<typeof keySourceSchema>;

/** A provider's key status. The key itself is never sent to the browser. */
export const providerStatusSchema = z.object({
  id: providerIdSchema,
  name: z.string(),
  keyEnvVar: z.string(),
  keysUrl: z.string(),
  modelExample: z.string(),
  configured: z.boolean(),
  source: keySourceSchema.nullable(),
  /** Last four characters, e.g. "…a1b2", so users can tell keys apart. */
  keyHint: z.string().nullable(),
  updatedAt: timestampSchema.nullable(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const providerKeyInputSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, 'That does not look like an API key')
    .max(500)
    .refine((key) => !/\s/.test(key), 'API keys do not contain spaces'),
});
export type ProviderKeyInput = z.input<typeof providerKeyInputSchema>;

export const providerTestResultSchema = z.object({
  /** valid: the provider accepted the key; rejected: it refused it; unverified: it could not be checked. */
  status: z.enum(['valid', 'rejected', 'unverified']),
  message: z.string(),
});
export type ProviderTestResult = z.infer<typeof providerTestResultSchema>;
