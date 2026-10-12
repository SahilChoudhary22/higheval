import { suiteInputSchema } from '@higheval/shared';
import { Judge, type JudgeRequest, type JudgeVerdict } from '../scoring/judge/judge.js';
import { scoreTask } from '../scoring/scorers.js';
import { CUSTOMER_CONVERSATIONS_SUITE, SAMPLE_JUDGE } from './customer-conversations-suite.js';
import { SAMPLE_MODELS } from './sample-definitions.js';

/** Rates every criterion 5/5, so only the deterministic checks can fail. */
class TopMarksJudge extends Judge {
  evaluate(request: JudgeRequest): Promise<JudgeVerdict> {
    return Promise.resolve({
      criteria: request.criteria.map((criterion) => ({
        key: criterion.key,
        rating: 5,
        reason: 'Fine.',
      })),
      overallReason: 'Fine.',
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0, requests: 1 },
    });
  }
}

/** Replies that satisfy every hard requirement; the judge's ratings cannot be unit-tested for truth. */
const REFERENCE: Record<string, string> = {
  'late-refund-reply':
    "I'm sorry for the frustration. Approved refunds take 5–7 business days to reach your card, so yours is still within that window. If it hasn't arrived after 7 business days, reply here and I'll escalate it to our billing lead.",
  'pricing-inquiry-reply':
    'Great question! Our pricing is tailored to your goals and ad spend, so we cover it on a free 20-minute discovery call rather than guessing. You can grab a time here: https://example.com/book',
  'sms-reschedule-reply':
    'No problem! Thursday we have 10:00 or 14:30. Which works for you? Reply with your pick and we will confirm. - Lumen Spa',
};

const WRONG: Record<string, string> = {
  'late-refund-reply': 'Sorry about that! Your refund will definitely arrive tomorrow.',
  'pricing-inquiry-reply':
    'Our Google Ads management usually runs $1,500 per month. Book here: https://example.com/book',
  'sms-reschedule-reply': 'Sure! Thursday at 10:00 works.',
};

describe('Customer conversations sample suite', () => {
  const suite = suiteInputSchema.parse(CUSTOMER_CONVERSATIONS_SUITE);
  const judge = new TopMarksJudge();

  it('is valid and judged by a model that is not under test', () => {
    expect(suite.tasks).toHaveLength(3);
    expect(Object.values(SAMPLE_MODELS)).not.toContain(SAMPLE_JUDGE.model);
  });

  it.each(suite.tasks.map((task) => [task.key, task] as const))(
    '%s: a compliant reply passes every check',
    async (key, task) => {
      const result = await scoreTask(
        task.scorers,
        {
          taskPrompt: task.prompt,
          finalOutput: REFERENCE[key] ?? '',
          readFile: () => null,
          toolCalls: [],
        },
        task.passThreshold,
        { judge },
      );
      expect(result.results.filter((entry) => !entry.passed)).toEqual([]);
      expect(result.passed).toBe(true);
    },
  );

  it('accepts the refund window written with any dash', async () => {
    const task = suite.tasks.find((candidate) => candidate.key === 'late-refund-reply');
    for (const dash of ['-', '\u2011', '\u2013', '\u2014', ' to ']) {
      const result = await scoreTask(
        task?.scorers ?? [],
        {
          taskPrompt: task?.prompt ?? '',
          finalOutput: `Sorry! Refunds take 5${dash}7 business days. If it is not there after day 7, I will escalate.`,
          readFile: () => null,
          toolCalls: [],
        },
        task?.passThreshold ?? 1,
        { judge },
      );
      expect(result.results[0]).toMatchObject({ passed: true });
    }
  });

  it.each(suite.tasks.map((task) => [task.key, task] as const))(
    '%s: a non-compliant reply fails a hard requirement even with top judge marks',
    async (key, task) => {
      const result = await scoreTask(
        task.scorers,
        {
          taskPrompt: task.prompt,
          finalOutput: WRONG[key] ?? '',
          readFile: () => null,
          toolCalls: [],
        },
        task.passThreshold,
        { judge },
      );
      expect(result.passed).toBe(false);
    },
  );
});
