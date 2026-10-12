import { scorerSpecSchema, type ScorerSpecInput } from '@higheval/shared';
import { Judge, type JudgeRequest, type JudgeVerdict } from './judge/judge.js';
import { scoreTask, type ScoringContext } from './scorers.js';

function context(overrides: Partial<ScoringContext> = {}): ScoringContext {
  const files: Record<string, string> = {
    'result.json': '{"overdue_total": 3345.25, "overdue_ids": ["INV-102", "INV-103"]}',
  };
  return {
    taskPrompt: 'Compute the overdue total.',
    finalOutput: 'Done. Total overdue is $3,345.25.',
    readFile: (path) => files[path] ?? null,
    toolCalls: [{ tool: 'read_file' }, { tool: 'write_file' }],
    ...overrides,
  };
}

const specs = (...inputs: ScorerSpecInput[]) =>
  inputs.map((input) => scorerSpecSchema.parse(input));

describe('scoreTask', () => {
  it('passes when every scorer passes', async () => {
    const result = await scoreTask(
      specs(
        { type: 'file_exists', path: 'result.json' },
        {
          type: 'json_field',
          target: { kind: 'file', path: 'result.json' },
          path: 'overdue_total',
          expected: 3345.25,
          tolerance: 0.01,
        },
        { type: 'contains', target: { kind: 'final_output' }, value: '3,345.25' },
        { type: 'tool_called', tool: 'read_file' },
      ),
      context(),
      1,
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.results.every((entry) => entry.passed)).toBe(true);
  });

  it('computes a weighted partial score with explanatory reasons', async () => {
    const result = await scoreTask(
      specs(
        { type: 'file_exists', path: 'result.json', weight: 1 },
        {
          type: 'json_field',
          target: { kind: 'file', path: 'result.json' },
          path: 'overdue_ids',
          expected: ['INV-102', 'INV-103', 'INV-105'],
          unordered: true,
          weight: 3,
        },
      ),
      context(),
      1,
    );
    expect(result.score).toBe(0.25);
    expect(result.passed).toBe(false);
    expect(result.results[1]?.reason).toContain('expected ["INV-102","INV-103","INV-105"]');
  });

  it('fails file-targeted scorers clearly when the file is missing', async () => {
    const result = await scoreTask(
      specs({ type: 'json_valid', target: { kind: 'file', path: 'missing.json' } }),
      context(),
      1,
    );
    expect(result.results[0]).toMatchObject({
      passed: false,
      reason: 'File missing.json is missing',
    });
  });

  it('fails final-output scorers when the run produced no output', async () => {
    const result = await scoreTask(
      specs({ type: 'regex', target: { kind: 'final_output' }, pattern: '\\d+' }),
      context({ finalOutput: null }),
      1,
    );
    expect(result.passed).toBe(false);
  });

  it('enforces tool call bounds', async () => {
    const result = await scoreTask(
      specs({ type: 'tool_called', tool: 'write_file', min: 0, max: 0 }),
      context(),
      1,
    );
    expect(result.results[0]?.reason).toBe('write_file called 1 time(s); expected 0–0');
    expect(result.passed).toBe(false);
  });

  it('honours a pass threshold below 1', async () => {
    const result = await scoreTask(
      specs(
        { type: 'contains', target: { kind: 'final_output' }, value: 'Done' },
        { type: 'contains', target: { kind: 'final_output' }, value: 'absent' },
      ),
      context(),
      0.5,
    );
    expect(result).toMatchObject({ score: 0.5, passed: true });
  });
});

const regex = (pattern: string, flags: string) =>
  scorerSpecSchema.safeParse({ type: 'regex', target: { kind: 'final_output' }, pattern, flags });

describe('regex scorer validation', () => {
  it('accepts a valid pattern with flags', () => {
    expect(regex('^42$', 'im').success).toBe(true);
  });

  it('rejects repeated flags, which would throw at scoring time', () => {
    expect(regex('a', 'ii').success).toBe(false);
  });

  it('validates the pattern together with its flags', () => {
    expect(regex('\\-', '').success).toBe(true);
    expect(regex('\\-', 'u').success).toBe(false);
  });
});

class FakeJudge extends Judge {
  readonly requests: JudgeRequest[] = [];

  constructor(private readonly ratings: Record<string, number>) {
    super();
  }

  evaluate(request: JudgeRequest): Promise<JudgeVerdict> {
    this.requests.push(request);
    return Promise.resolve({
      criteria: request.criteria.map((criterion) => ({
        key: criterion.key,
        rating: this.ratings[criterion.key] ?? 3,
        reason: `Rated ${criterion.key}.`,
      })),
      overallReason: 'Polite but vague.',
      usage: { inputTokens: 300, outputTokens: 50, costUsd: 0.001, requests: 1 },
    });
  }
}

const judgeSpec = scorerSpecSchema.parse({
  type: 'llm_judge',
  target: { kind: 'final_output' },
  judge: { provider: 'openrouter', model: 'judge/model' },
  rubric: 'Be accurate and kind.',
  criteria: [
    { key: 'empathy', description: 'Acknowledges the customer' },
    { key: 'accuracy', description: 'States the policy correctly' },
  ],
  weight: 2,
});

describe('scoreTask with an LLM judge', () => {
  it('normalizes 1–5 ratings, weights them into the task score and records details', async () => {
    const judge = new FakeJudge({ empathy: 5, accuracy: 3 });
    const result = await scoreTask(
      [
        judgeSpec,
        ...specs({ type: 'contains', target: { kind: 'final_output' }, value: 'overdue' }),
      ],
      context(),
      0.8,
      { judge },
    );
    // Judge: (1 + 0.5) / 2 = 0.75 with weight 2; contains: 1 with weight 1 → (1.5 + 1) / 3.
    expect(result.score).toBeCloseTo(0.8333, 4);
    expect(result.passed).toBe(true);
    expect(result.results[0]).toMatchObject({
      type: 'llm_judge',
      score: 0.75,
      passed: true,
      reason: 'Mean rating 4.0/5. Polite but vague.',
      details: {
        model: 'judge/model',
        criteria: [
          { key: 'empathy', rating: 5, score: 1 },
          { key: 'accuracy', rating: 3, score: 0.5 },
        ],
      },
    });
    expect(result.judgeUsage).toEqual({ requests: 1, tokens: 350, costUsd: 0.001 });
    expect(judge.requests[0]).toMatchObject({
      taskPrompt: 'Compute the overdue total.',
      responseLabel: 'Final output',
    });
  });

  it('fails without calling the judge when there is nothing to judge', async () => {
    const judge = new FakeJudge({});
    const result = await scoreTask([judgeSpec], context({ finalOutput: '  ' }), 1, { judge });
    expect(result.results[0]).toMatchObject({ passed: false, score: 0, details: null });
    expect(judge.requests).toHaveLength(0);
    expect(result.judgeUsage.requests).toBe(0);
  });

  it('throws when a task needs a judge but none is configured', async () => {
    await expect(scoreTask([judgeSpec], context(), 1)).rejects.toThrow('no judge is configured');
  });
});

describe('required scorers', () => {
  it('fail the task when a hard requirement fails, whatever the weighted score', async () => {
    const result = await scoreTask(
      specs(
        { type: 'contains', target: { kind: 'final_output' }, value: 'absent', required: true },
        { type: 'contains', target: { kind: 'final_output' }, value: 'Done', weight: 9 },
      ),
      context(),
      0.5,
    );
    expect(result.score).toBe(0.9);
    expect(result.passed).toBe(false);
    expect(result.results[0]).toMatchObject({ required: true, passed: false });
  });
});

describe('regex safety', () => {
  it('rejects nested quantifiers that can backtrack exponentially', () => {
    expect(regex('(a+)+$', '').success).toBe(false);
    expect(regex('(?:x*y)*', '').success).toBe(false);
    expect(regex('((ab)*c)+', '').success).toBe(false);
  });

  it('allows ordinary patterns, including quantified groups without inner repetition', () => {
    for (const pattern of [
      '^(?![\\s\\S]*\\btomorrow\\b)',
      '(?:14:30|2:30)',
      '(ab)+',
      '[(a+)]+',
      '\\(a+\\)+',
    ]) {
      expect({ pattern, ok: regex(pattern, '').success }).toEqual({ pattern, ok: true });
    }
  });
});
