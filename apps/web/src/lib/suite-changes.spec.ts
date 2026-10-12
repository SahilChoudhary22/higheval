import type { SuiteInput } from '@higheval/shared';
import { describe, expect, it } from 'vitest';
import { suiteChanges } from './suite-changes';

const task = (key: string, prompt = 'Do it.'): SuiteInput['tasks'][number] => ({
  key,
  title: key,
  prompt,
  scorers: [{ type: 'file_exists', path: 'out.json' }],
});

describe('suiteChanges', () => {
  it('sorts tasks into added, removed, changed and unchanged by key', () => {
    const before: SuiteInput = { name: 'Clinic', tasks: [task('a'), task('b'), task('c')] };
    const after: SuiteInput = { name: 'Clinic', tasks: [task('a'), task('b', 'New.'), task('d')] };
    expect(suiteChanges(before, after)).toEqual({
      added: ['d'],
      removed: ['c'],
      changed: ['b'],
      unchanged: 1,
      detailsChanged: false,
    });
  });

  it('ignores key order but notices a renamed suite', () => {
    const before: SuiteInput = { name: 'Clinic', tasks: [task('a')] };
    const reordered = Object.fromEntries(Object.entries(task('a')).toReversed());
    const after = { name: 'Clinic v2', tasks: [reordered] } as SuiteInput;
    expect(suiteChanges(before, after)).toMatchObject({
      changed: [],
      unchanged: 1,
      detailsChanged: true,
    });
  });
});
