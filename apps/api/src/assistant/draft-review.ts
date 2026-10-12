import {
  friendlyError,
  suiteInputSchema,
  type DraftCheck,
  type ScorerSpec,
  type SuiteDraft,
} from '@higheval/shared';
import { z } from 'zod';
import { scoreTask } from '../scoring/scorers.js';

/** What a perfect agent leaves behind for one task. */
const referenceSchema = z.record(
  z.string(),
  z.object({
    /** Files it writes, path → content (JSON written as text). */
    files: z
      .record(
        z.string(),
        z.union([z.string(), z.unknown().transform((value) => JSON.stringify(value, null, 2))]),
      )
      .default({}),
    /** Its final reply. */
    output: z.string().default(''),
  }),
);

export interface DraftReview {
  /** The parsed suite, when it passes the schema. */
  suite: SuiteDraft['suite'];
  /** Self-test results per task; empty when the suite is invalid. */
  checks: DraftCheck[];
  /** Everything the agent must fix, one line each; empty when the draft is done. */
  problems: string[];
}

/** Scorers that can be checked against a static reference (no judge, no tool trace). */
const isStaticallyCheckable = (scorer: ScorerSpec): boolean =>
  scorer.type !== 'llm_judge' && scorer.type !== 'tool_called';

function parseJson(text: string | null, file: string): { value?: unknown; problem?: string } {
  if (text === null) return { problem: `${file} was not written.` };
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return {
      problem: `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks a drafted suite the way a reviewer would: it must pass the suite
 * schema, and every deterministic scorer must pass against the agent's own
 * reference solution, which catches wrong paths, typos and mismatched values.
 */
export async function reviewDraft(
  suiteText: string | null,
  referenceText: string | null,
): Promise<DraftReview> {
  const parsedSuite = parseJson(suiteText, 'suite.json');
  if (parsedSuite.problem) return { suite: null, checks: [], problems: [parsedSuite.problem] };
  const result = suiteInputSchema.safeParse(parsedSuite.value, { error: friendlyError });
  if (!result.success) {
    return {
      suite: null,
      checks: [],
      problems: result.error.issues.map(
        (issue) =>
          `suite.json ${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`,
      ),
    };
  }
  const suite = result.data;

  const parsedReference = parseJson(referenceText, 'reference.json');
  const references = parsedReference.problem
    ? undefined
    : referenceSchema.safeParse(parsedReference.value);
  if (!references?.success) {
    return {
      suite,
      checks: [],
      problems: [
        parsedReference.problem ??
          'reference.json must map each task key to {"files": {...}, "output": "..."}.',
      ],
    };
  }

  const checks: DraftCheck[] = [];
  const problems: string[] = [];
  for (const task of suite.tasks) {
    const reference = references.data[task.key];
    if (!reference) {
      checks.push({ taskKey: task.key, passed: false, problems: ['No reference solution.'] });
      problems.push(`reference.json has no entry for task "${task.key}".`);
      continue;
    }
    const fixtures = new Map(task.fixtures.map((fixture) => [fixture.path, fixture.content]));
    const scored = await scoreTask(
      task.scorers.filter(isStaticallyCheckable),
      {
        taskPrompt: task.prompt,
        finalOutput: reference.output,
        readFile: (path) => reference.files[path] ?? fixtures.get(path) ?? null,
        toolCalls: [],
      },
      task.passThreshold,
    );
    const failures = scored.results
      .filter((entry) => !entry.passed)
      .map((entry) => `${entry.label}: ${entry.reason}`);
    checks.push({ taskKey: task.key, passed: failures.length === 0, problems: failures });
    problems.push(
      ...failures.map((failure) => `Task "${task.key}" fails against its reference — ${failure}`),
    );
  }

  for (const key of Object.keys(references.data)) {
    if (!suite.tasks.some((task) => task.key === key)) {
      problems.push(`reference.json has "${key}", which is not a task key.`);
    }
  }
  return { suite, checks, problems };
}
