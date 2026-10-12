import { z } from 'zod';
import { relativePathSchema } from './common.js';

/**
 * What a scorer inspects. `final_output` is the agent's final reply;
 * `file` is a file the agent left in its working directory.
 */
export const scorerTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('final_output') }),
  z.object({ kind: z.literal('file'), path: relativePathSchema }),
]);
export type ScorerTarget = z.infer<typeof scorerTargetSchema>;

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
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

function isValidRegex(pattern: string): boolean {
  try {
    return new RegExp(pattern) instanceof RegExp;
  } catch {
    return false;
  }
}

const scorerBase = {
  /** Human-readable label shown next to the result. */
  label: z.string().min(1).max(120).optional(),
  /** Relative weight in the task score. */
  weight: z.number().positive().max(100).default(1),
};

export const scorerSpecSchema = z.discriminatedUnion('type', [
  z.object({
    ...scorerBase,
    type: z.literal('contains'),
    target: scorerTargetSchema,
    value: z.string().min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    ...scorerBase,
    type: z.literal('regex'),
    target: scorerTargetSchema,
    pattern: z.string().min(1).max(500).refine(isValidRegex, 'Invalid regular expression'),
    flags: z
      .string()
      .regex(/^[imsu]*$/)
      .default(''),
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
]);
export type ScorerSpec = z.infer<typeof scorerSpecSchema>;
export type ScorerSpecInput = z.input<typeof scorerSpecSchema>;
export type ScorerType = ScorerSpec['type'];

export const scoreResultSchema = z.object({
  scorerIndex: z.int().nonnegative(),
  type: z.string(),
  label: z.string(),
  weight: z.number(),
  passed: z.boolean(),
  /** In [0, 1]. Binary scorers emit 0 or 1. */
  score: z.number().min(0).max(1),
  reason: z.string(),
});
export type ScoreResult = z.infer<typeof scoreResultSchema>;
