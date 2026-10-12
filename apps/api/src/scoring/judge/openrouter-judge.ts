import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JudgeUsage } from '@higheval/shared';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { Env } from '../../config/env.schema.js';
import { ProviderCredentials } from '../../providers/provider-credentials.service.js';
import { Judge, JudgeError, type JudgeRequest, type JudgeVerdict } from './judge.js';
import { buildJudgeMessages, parseJudgeReply } from './judge-prompt.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** Rate limits and server errors are retried this many times in total. */
const MAX_REQUESTS = 4;
/** Unparseable replies get one more chance before the run is marked `scoring`. */
const MAX_PARSE_RETRIES = 1;
/**
 * Generous because many judges are reasoning models: their hidden reasoning
 * counts against this limit, and a cut-off reply contains no verdict.
 */
const MAX_OUTPUT_TOKENS = 4_000;

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().default(0),
      completion_tokens: z.number().default(0),
      cost: z.number().optional(),
    })
    .optional(),
});

/**
 * LLM judge backed by OpenRouter chat completions, called directly from the
 * API (not through Hermes). Deterministic settings: temperature 0, bounded
 * output, no tools. Cost comes from OpenRouter's usage accounting.
 */
@Injectable()
export class OpenRouterJudge extends Judge {
  private readonly retryBaseMs: number;

  constructor(
    private readonly credentials: ProviderCredentials,
    config: ConfigService<Env, true>,
  ) {
    super();
    this.retryBaseMs = config.get('JUDGE_RETRY_BASE_DELAY_MS', { infer: true });
  }

  async evaluate(request: JudgeRequest, signal?: AbortSignal): Promise<JudgeVerdict> {
    const apiKey = this.credentials.key('openrouter');
    if (!apiKey) throw new JudgeError('No OpenRouter API key is configured for the judge.');
    const body = JSON.stringify({
      model: request.model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      usage: { include: true },
      messages: buildJudgeMessages(request),
    });

    const usage: JudgeUsage = { inputTokens: 0, outputTokens: 0, costUsd: null, requests: 0 };
    let parseFailures = 0;
    let lastError = 'no response';
    while (usage.requests < MAX_REQUESTS) {
      usage.requests++;
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: signal ?? null,
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = `HTTP ${String(response.status)}`;
        await sleep(
          this.backoffMs(usage.requests, response.headers.get('retry-after')),
          undefined,
          { signal },
        );
        continue;
      }
      if (!response.ok) {
        throw new JudgeError(
          `Judge request failed with HTTP ${String(response.status)}: ${await errorText(response)}`,
        );
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) throw new JudgeError('Judge returned an unexpected response shape');
      addUsage(usage, parsed.data.usage);
      const choice = parsed.data.choices[0];
      try {
        if (choice?.finish_reason === 'length') {
          throw new JudgeError(
            `Judge reply was cut off at the ${String(MAX_OUTPUT_TOKENS)}-token output limit`,
          );
        }
        const verdict = parseJudgeReply(choice?.message.content ?? '', request.criteria);
        return { ...verdict, usage };
      } catch (error) {
        if (!(error instanceof JudgeError) || parseFailures >= MAX_PARSE_RETRIES) throw error;
        parseFailures++;
        lastError = error.message;
      }
    }
    throw new JudgeError(
      `Judge gave no usable verdict after ${String(usage.requests)} requests (${lastError})`,
    );
  }

  /** Exponential backoff, honouring Retry-After (seconds) when the provider sends one. */
  private backoffMs(attempt: number, retryAfter: string | null): number {
    const hinted = retryAfter === null ? Number.NaN : Number(retryAfter) * 1000;
    if (Number.isFinite(hinted)) return Math.min(hinted, 60_000);
    return this.retryBaseMs * 2 ** (attempt - 1);
  }
}

function addUsage(
  usage: JudgeUsage,
  reported:
    { prompt_tokens: number; completion_tokens: number; cost?: number | undefined } | undefined,
): void {
  if (!reported) return;
  usage.inputTokens += Math.round(reported.prompt_tokens);
  usage.outputTokens += Math.round(reported.completion_tokens);
  if (reported.cost !== undefined) usage.costUsd = (usage.costUsd ?? 0) + reported.cost;
}

async function errorText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return response.statusText;
  }
}
