import { reviewDraft } from './draft-review.js';

const suite = {
  name: 'Invoices',
  tasks: [
    {
      key: 'overdue-total',
      title: 'Overdue total',
      prompt: 'Write the overdue total to total.json as {"total": <number>}.',
      fixtures: [{ path: 'invoices.csv', content: 'id,amount,overdue\n1,100,yes\n2,50,no\n' }],
      scorers: [
        { type: 'file_exists', path: 'total.json' },
        {
          type: 'json_field',
          target: { kind: 'file', path: 'total.json' },
          path: 'total',
          expected: 100,
        },
        { type: 'tool_called', tool: 'write_file' },
      ],
    },
  ],
};
const reference = { 'overdue-total': { files: { 'total.json': { total: 100 } }, output: 'Done.' } };
const text = (value: unknown): string => JSON.stringify(value);

describe('reviewDraft', () => {
  it('accepts a valid suite whose reference passes every checkable scorer', async () => {
    const review = await reviewDraft(text(suite), text(reference));
    expect(review.problems).toEqual([]);
    expect(review.suite?.tasks[0]?.key).toBe('overdue-total');
    expect(review.checks).toEqual([{ taskKey: 'overdue-total', passed: true, problems: [] }]);
  });

  it('reports files that are missing or not JSON', async () => {
    expect((await reviewDraft(null, null)).problems).toEqual(['suite.json was not written.']);
    const broken = await reviewDraft('{"name": ', null);
    expect(broken.suite).toBeNull();
    expect(broken.problems[0]).toMatch(/^suite\.json is not valid JSON/);
  });

  it('reports schema problems with their paths', async () => {
    const review = await reviewDraft(
      text({ ...suite, tasks: [{ ...suite.tasks[0], key: 'Bad Key' }] }),
      null,
    );
    expect(review.suite).toBeNull();
    expect(review.problems).toEqual([
      'suite.json tasks.0.key: Use lowercase letters, digits and single hyphens',
    ]);
  });

  it('keeps a valid suite but flags a scorer its own reference fails', async () => {
    const wrong = { 'overdue-total': { files: { 'total.json': { total: 150 } } } };
    const review = await reviewDraft(text(suite), text(wrong));
    expect(review.suite).not.toBeNull();
    expect(review.checks[0]?.passed).toBe(false);
    expect(review.problems).toHaveLength(1);
    expect(review.problems[0]).toContain('Task "overdue-total" fails against its reference');
  });

  it('flags missing and unknown reference entries', async () => {
    const review = await reviewDraft(text(suite), text({ other: { output: 'x' } }));
    expect(review.problems).toEqual([
      'reference.json has no entry for task "overdue-total".',
      'reference.json has "other", which is not a task key.',
    ]);
    expect((await reviewDraft(text(suite), '[]')).problems[0]).toMatch(/reference\.json must map/);
  });
});
