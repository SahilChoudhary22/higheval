import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../../config/env.schema.js';
import { ProviderCredentials } from '../../providers/provider-credentials.service.js';
import { JudgeError, type JudgeRequest } from './judge.js';
import { OpenRouterJudge } from './openrouter-judge.js';

const request: JudgeRequest = {
  model: 'judge/model',
  rubric: 'Policy.',
  criteria: [{ key: 'accuracy', description: 'Correct' }],
  taskPrompt: 'Reply.',
  response: 'Answer.',
  responseLabel: 'Final reply',
};

const verdictText = JSON.stringify({
  criteria: [{ key: 'accuracy', rating: 4, reason: 'Good.' }],
  overall_reason: 'Fine.',
});
const completion = (content: string, cost = 0.0002) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost },
    }),
    {
      status: 200,
    },
  );

function createJudge(
  env: Record<string, unknown> = { OPENROUTER_API_KEY: 'key' },
): OpenRouterJudge {
  const config = new ConfigService<Env, true>(
    validateEnv({ JUDGE_RETRY_BASE_DELAY_MS: '0', ...env }),
  );
  return new OpenRouterJudge(new ProviderCredentials(config), config);
}

describe('OpenRouterJudge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends deterministic settings and returns the parsed verdict with usage', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion(verdictText));
    vi.stubGlobal('fetch', fetchMock);
    const verdict = await createJudge().evaluate(request);
    expect(verdict).toEqual({
      criteria: [{ key: 'accuracy', rating: 4, reason: 'Good.' }],
      overallReason: 'Fine.',
      usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.0002, requests: 1 },
    });
    const sent = fetchMock.mock.calls[0]?.[1]?.body;
    const body: unknown = JSON.parse(typeof sent === 'string' ? sent : '{}');
    expect(body).toMatchObject({ model: 'judge/model', temperature: 0, usage: { include: true } });
  });

  it('retries once on an unparseable reply and accumulates usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(completion('not json'))
        .mockResolvedValueOnce(completion(verdictText)),
    );
    const verdict = await createJudge().evaluate(request);
    expect(verdict.usage).toMatchObject({ requests: 2, inputTokens: 200, outputTokens: 40 });
  });

  it('gives up after a second unparseable reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(completion('still not json'))),
    );
    await expect(createJudge().evaluate(request)).rejects.toThrow('Judge reply contained no JSON');
  });

  it('backs off on rate limits, then fails with a clear error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response('busy', { status: 429 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createJudge().evaluate(request)).rejects.toThrow('after 4 requests (HTTP 429)');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('fails fast on client errors and when no key is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('bad model', { status: 400 })),
    );
    await expect(createJudge().evaluate(request)).rejects.toThrow('HTTP 400: bad model');
    await expect(createJudge({}).evaluate(request)).rejects.toBeInstanceOf(JudgeError);
  });
});
