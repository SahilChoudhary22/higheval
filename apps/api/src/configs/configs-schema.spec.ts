import { agentConfigInputSchema } from '@higheval/shared';

const config = (model: string) =>
  agentConfigInputSchema.safeParse({ name: 'x', model: { provider: 'openrouter', model } });

describe('agent config model validation', () => {
  it('accepts exact model IDs, including free variants', () => {
    expect(config('nvidia/nemotron-3.5-lightning:free').success).toBe(true);
  });

  it('rejects router aliases that can switch models between runs', () => {
    expect(config('openrouter/auto').success).toBe(false);
    expect(config('openrouter/free').success).toBe(false);
  });
});
