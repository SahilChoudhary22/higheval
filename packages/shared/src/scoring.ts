import { z } from 'zod';
import { relativePathSchema, slugSchema } from './common.js';
import { modelIdSchema } from './configs.js';

/**
 * What a scorer inspects. `final_output` is the agent's final reply;
 * `file` is a file the agent left in its working directory.
 */
export const scorerTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('final_output') }),
  z.object({ kind: z.literal('file'), path: relativePathSchema }),
]);
export type ScorerTarget = z.infer<typeof scorerTargetSchema>;

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function compiles(pattern: string, flags = ''): boolean {
  try {
    return new RegExp(pattern, flags) instanceof RegExp;
  } catch {
    return false;
  }
}

const isRepeat = (char: string | undefined): boolean =>
  char === '*' || char === '+' || char === '{';

/**
 * Heuristic guard against catastrophic backtracking: flags a quantified group
 * whose body is itself quantified, the classic ReDoS shape, e.g. `(a+)+` or
 * `(?:x*y)*`. Character classes and escapes are skipped; `?` is not counted.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  const groups: boolean[] = [];
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '\\') {
      index++;
    } else if (char === '[') {
      index++;
      while (index < pattern.length && pattern[index] !== ']') {
        if (pattern[index] === '\\') index++;
        index++;
      }
    } else if (char === '(') {
      groups.push(false);
    } else if (char === ')') {
      const bodyRepeats = groups.pop() ?? false;
      const groupRepeats = isRepeat(pattern[index + 1]);
      if (bodyRepeats && groupRepeats) return true;
      if ((bodyRepeats || groupRepeats) && groups.length > 0) groups[groups.length - 1] = true;
    } else if (isRepeat(char) && groups.length > 0) {
      groups[groups.length - 1] = true;
    }
  }
  return false;
}

const scorerBase = {
  /** Human-readable label shown next to the result. */
  label: z.string().min(1).max(120).optional(),
  /** Relative weight in the task score. */
  weight: z.number().positive().max(100).default(1),
  /**
   * A hard requirement: if it fails, the task fails regardless of its weighted
   * score, so quality points elsewhere cannot buy back a broken rule.
   */
  required: z.boolean().default(false),
};

export const scorerSpecSchema = z.discriminatedUnion('type', [
  z.object({
    ...scorerBase,
    type: z.literal('contains'),
    target: scorerTargetSchema,
    value: z.string().min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z
    .object({
      ...scorerBase,
      type: z.literal('regex'),
      target: scorerTargetSchema,
      pattern: z.string().min(1).max(500),
      /** Any of i, m, s, u, each at most once. */
      flags: z
        .string()
        .regex(/^(?!.*(.).*\1)[imsu]*$/, 'Use each of i, m, s, u at most once')
        .default(''),
    })
    // Pattern and flags are validated together: "\-" is valid alone but not with "u".
    .refine((spec) => compiles(spec.pattern, spec.flags), {
      message: 'Invalid regular expression for these flags',
      path: ['pattern'],
    })
    .refine((spec) => !hasNestedQuantifier(spec.pattern), {
      message:
        'Pattern repeats a group that itself repeats (e.g. (a+)+), which can take exponential time on long text',
      path: ['pattern'],
    }),
  z.object({
    ...scorerBase,
    type: z.literal('json_valid'),
    target: scorerTargetSchema,
  }),
  z.object({
    ...scorerBase,
    type: z.literal('json_field'),
    target: scorerTargetSchema,
    /** Dot/bracket path into the parsed JSON, e.g. `items[0].total`. Empty for the root. */
    path: z.string().max(200),
    expected: jsonValueSchema,
    /** Absolute tolerance for numeric comparison. */
    tolerance: z.number().nonnegative().optional(),
    /** Compare arrays ignoring element order. */
    unordered: z.boolean().default(false),
    /** Objects must have exactly the expected keys, so invented extra keys fail. */
    exact: z.boolean().default(false),
  }),
  z.object({
    ...scorerBase,
    type: z.literal('file_exists'),
    path: relativePathSchema,
  }),
  z.object({
    ...scorerBase,
    type: z.literal('tool_called'),
    tool: z.string().min(1),
    min: z.int().nonnegative().default(1),
    max: z.int().nonnegative().optional(),
  }),
  z.object({
    ...scorerBase,
    type: z.literal('llm_judge'),
    target: scorerTargetSchema,
    /**
     * Pinned judge model. It must differ from both models under test
     * (checked at launch) to avoid a model grading its own output.
     */
    judge: z.object({
      /** Judges call OpenRouter's chat API directly; other providers are not wired for judging yet. */
      provider: z.literal('openrouter'),
      model: modelIdSchema,
    }),
    /** Instructions and context the judge needs, e.g. the policy a reply must follow. */
    rubric: z.string().min(1).max(10_000),
    /** What the judge rates, each from 1 (very poor) to 5 (excellent). */
    criteria: z
      .array(
        z.object({
          key: slugSchema,
          description: z.string().min(1).max(500),
        }),
      )
      .min(1)
      .max(8)
      .refine(
        (criteria) => new Set(criteria.map((criterion) => criterion.key)).size === criteria.length,
        'Criterion keys must be unique',
      ),
    /** Mean normalized rating at or above which this scorer passes. */
    passThreshold: z.number().min(0).max(1).default(0.7),
  }),
]);
export type ScorerSpec = z.infer<typeof scorerSpecSchema>;
export type ScorerSpecInput = z.input<typeof scorerSpecSchema>;
export type ScorerType = ScorerSpec['type'];

export const judgeUsageSchema = z.object({
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  /** Provider-reported cost; null when the provider does not report it. */
  costUsd: z.number().nonnegative().nullable(),
  /** Requests made, including retries after unparseable or rate-limited replies. */
  requests: z.int().positive(),
});
export type JudgeUsage = z.infer<typeof judgeUsageSchema>;

/** Per-criterion evidence recorded for an `llm_judge` scorer. */
export const judgeDetailsSchema = z.object({
  kind: z.literal('llm_judge'),
  model: z.string(),
  criteria: z.array(
    z.object({
      key: z.string(),
      description: z.string(),
      /** 1–5 as returned by the judge. */
      rating: z.int().min(1).max(5),
      /** (rating − 1) / 4, in [0, 1]. */
      score: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
  overallReason: z.string(),
  usage: judgeUsageSchema,
});
export type JudgeDetails = z.infer<typeof judgeDetailsSchema>;

export const scoreResultSchema = z.object({
  scorerIndex: z.int().nonnegative(),
  type: z.string(),
  label: z.string(),
  weight: z.number(),
  passed: z.boolean(),
  /** In [0, 1]. Binary scorers emit 0 or 1; judges emit the mean normalized rating. */
  score: z.number().min(0).max(1),
  reason: z.string(),
  /** Whether this scorer was a hard requirement (see `required` on scorer specs). */
  required: z.boolean().default(false),
  /** Extra evidence for scorers that have it (currently LLM judges). */
  details: judgeDetailsSchema.nullable().default(null),
});
export type ScoreResult = z.infer<typeof scoreResultSchema>;
