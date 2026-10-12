import { scorerSpecSchema, type ScorerSpecInput } from '@higheval/shared';
import { scoreTask, type ScoringContext } from './scorers.js';

function context(overrides: Partial<ScoringContext> = {}): ScoringContext {
  const files: Record<string, string> = {
    'result.json': '{"overdue_total": 3345.25, "overdue_ids": ["INV-102", "INV-103"]}',
  };
  return {
    finalOutput: 'Done. Total overdue is $3,345.25.',
    readFile: (path) => files[path] ?? null,
    toolCalls: [{ tool: 'read_file' }, { tool: 'write_file' }],
    ...overrides,
  };
}

const specs = (...inputs: ScorerSpecInput[]) =>
  inputs.map((input) => scorerSpecSchema.parse(input));

describe('scoreTask', () => {
  it('passes when every scorer passes', () => {
    const result = scoreTask(
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

  it('computes a weighted partial score with explanatory reasons', () => {
    const result = scoreTask(
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

  it('fails file-targeted scorers clearly when the file is missing', () => {
    const result = scoreTask(
      specs({ type: 'json_valid', target: { kind: 'file', path: 'missing.json' } }),
      context(),
      1,
    );
    expect(result.results[0]).toMatchObject({
      passed: false,
      reason: 'File missing.json is missing',
    });
  });

  it('fails final-output scorers when the run produced no output', () => {
    const result = scoreTask(
      specs({ type: 'regex', target: { kind: 'final_output' }, pattern: '\\d+' }),
      context({ finalOutput: null }),
      1,
    );
    expect(result.passed).toBe(false);
  });

  it('enforces tool call bounds', () => {
    const result = scoreTask(
      specs({ type: 'tool_called', tool: 'write_file', min: 0, max: 0 }),
      context(),
      1,
    );
    expect(result.results[0]?.reason).toBe('write_file called 1 time(s); expected 0–0');
    expect(result.passed).toBe(false);
  });

  it('honours a pass threshold below 1', () => {
    const result = scoreTask(
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
