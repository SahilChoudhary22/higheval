import type { JudgeDetails, ScoreResult, ScorerSpec, ScorerTarget } from '@higheval/shared';
import { extractJson, getAtPath, jsonMatches, preview } from './json-utils.js';
import type { Judge } from './judge/judge.js';

/** Everything a scorer may inspect about a finished run. */
export interface ScoringContext {
  /** The prompt the agent received; LLM judges need it to assess relevance. */
  taskPrompt: string;
  finalOutput: string | null;
  /** Reads a workspace file; returns null when it does not exist. */
  readFile(path: string): string | null;
  toolCalls: readonly { tool: string }[];
}

export interface TaskScore {
  results: ScoreResult[];
  /** Weighted mean of scorer scores, in [0, 1]. */
  score: number;
  passed: boolean;
  /** What LLM judges spent scoring this run; zero when no judge ran. */
  judgeUsage: { requests: number; tokens: number; costUsd: number | null };
}

export interface ScoringOptions {
  /** Required when any scorer is an `llm_judge`. */
  judge?: Judge;
  /** Aborts in-flight judge calls, e.g. when the experiment is cancelled. */
  signal?: AbortSignal;
}

/** Longest text a regex scorer scans; agent replies are far shorter. */
const MAX_REGEX_INPUT = 200_000;

type Outcome = Pick<ScoreResult, 'passed' | 'score' | 'reason'> & { details?: JudgeDetails };
type DeterministicScorer = Exclude<ScorerSpec, { type: 'llm_judge' }>;
type JudgeScorer = Extract<ScorerSpec, { type: 'llm_judge' }>;

const pass = (reason: string): Outcome => ({ passed: true, score: 1, reason });
const fail = (reason: string): Outcome => ({ passed: false, score: 0, reason });

/**
 * Scores a finished run. Deterministic scorers are pure and synchronous; LLM
 * judges are awaited one at a time (gentle on provider rate limits). A judge
 * failure throws, so the caller records the run as a `scoring` error rather
 * than scoring it zero.
 */
export async function scoreTask(
  scorers: readonly ScorerSpec[],
  context: ScoringContext,
  passThreshold: number,
  options: ScoringOptions = {},
): Promise<TaskScore> {
  const results: ScoreResult[] = [];
  const judgeUsage: TaskScore['judgeUsage'] = { requests: 0, tokens: 0, costUsd: null };
  for (const [scorerIndex, spec] of scorers.entries()) {
    const { details, ...outcome } =
      spec.type === 'llm_judge'
        ? await evaluateWithJudge(spec, context, options)
        : evaluate(spec, context);
    if (details) {
      judgeUsage.requests += details.usage.requests;
      judgeUsage.tokens += details.usage.inputTokens + details.usage.outputTokens;
      if (details.usage.costUsd !== null)
        judgeUsage.costUsd = (judgeUsage.costUsd ?? 0) + details.usage.costUsd;
    }
    results.push({
      scorerIndex,
      type: spec.type,
      label: spec.label ?? defaultLabel(spec),
      weight: spec.weight,
      required: spec.required,
      ...outcome,
      details: details ?? null,
    });
  }
  const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : results.reduce((sum, result) => sum + result.score * result.weight, 0) / totalWeight;
  const rounded = round(score);
  const requirementsMet = results.every((result) => !result.required || result.passed);
  return {
    results,
    score: rounded,
    passed: requirementsMet && rounded >= passThreshold,
    judgeUsage,
  };
}

/** Rounds away floating-point noise so a perfect score compares equal to 1. */
const round = (value: number): number => Math.round(value * 1e9) / 1e9;

async function evaluateWithJudge(
  spec: JudgeScorer,
  context: ScoringContext,
  options: ScoringOptions,
): Promise<Outcome> {
  const text = resolveTarget(spec.target, context);
  if (text === null || text.trim() === '')
    return fail(`${describeTarget(spec.target)} is missing, so there is nothing to judge`);
  if (!options.judge) throw new Error('This task uses an LLM judge, but no judge is configured');
  const verdict = await options.judge.evaluate(
    {
      model: spec.judge.model,
      rubric: spec.rubric,
      criteria: spec.criteria,
      taskPrompt: context.taskPrompt,
      response: text,
      responseLabel: describeTarget(spec.target),
    },
    options.signal,
  );
  const criteria = verdict.criteria.map((entry, index) => ({
    key: entry.key,
    description: spec.criteria[index]?.description ?? '',
    rating: entry.rating,
    score: (entry.rating - 1) / 4,
    reason: entry.reason,
  }));
  const score = round(criteria.reduce((sum, entry) => sum + entry.score, 0) / criteria.length);
  const meanRating = criteria.reduce((sum, entry) => sum + entry.rating, 0) / criteria.length;
  return {
    passed: score >= spec.passThreshold,
    score,
    reason: `Mean rating ${meanRating.toFixed(1)}/5. ${verdict.overallReason}`.trim(),
    details: {
      kind: 'llm_judge',
      model: spec.judge.model,
      criteria,
      overallReason: verdict.overallReason,
      usage: verdict.usage,
    },
  };
}

function evaluate(spec: DeterministicScorer, context: ScoringContext): Outcome {
  switch (spec.type) {
    case 'contains': {
      const text = resolveTarget(spec.target, context);
      if (text === null) return fail(`${describeTarget(spec.target)} is missing`);
      const haystack = spec.caseSensitive ? text : text.toLowerCase();
      const needle = spec.caseSensitive ? spec.value : spec.value.toLowerCase();
      return haystack.includes(needle)
        ? pass(`Found ${preview(spec.value)}`)
        : fail(`${describeTarget(spec.target)} does not contain ${preview(spec.value)}`);
    }
    case 'regex': {
      const text = resolveTarget(spec.target, context);
      if (text === null) return fail(`${describeTarget(spec.target)} is missing`);
      // Bounded input as a second line of defence against slow patterns.
      const match = new RegExp(spec.pattern, spec.flags).exec(text.slice(0, MAX_REGEX_INPUT));
      return match
        ? pass(`Matched /${spec.pattern}/ with ${preview(match[0])}`)
        : fail(`${describeTarget(spec.target)} does not match /${spec.pattern}/`);
    }
    case 'json_valid': {
      const text = resolveTarget(spec.target, context);
      if (text === null) return fail(`${describeTarget(spec.target)} is missing`);
      const parsed = extractJson(text);
      return parsed.ok
        ? pass(`${describeTarget(spec.target)} contains valid JSON`)
        : fail(`${describeTarget(spec.target)}: ${parsed.error}`);
    }
    case 'json_field': {
      const text = resolveTarget(spec.target, context);
      if (text === null) return fail(`${describeTarget(spec.target)} is missing`);
      const parsed = extractJson(text);
      if (!parsed.ok) return fail(`${describeTarget(spec.target)}: ${parsed.error}`);
      const field = spec.path === '' ? 'root' : `"${spec.path}"`;
      const lookup = getAtPath(parsed.value, spec.path);
      if (!lookup.found) return fail(`Field ${field} not found`);
      const matches = jsonMatches(lookup.value, spec.expected, {
        tolerance: spec.tolerance,
        unordered: spec.unordered,
        exact: spec.exact,
      });
      const tolerance = spec.tolerance === undefined ? '' : ` (±${String(spec.tolerance)})`;
      return matches
        ? pass(`Field ${field} = ${preview(lookup.value)}${tolerance}`)
        : fail(
            `Field ${field} = ${preview(lookup.value)}, expected ${preview(spec.expected)}${tolerance}`,
          );
    }
    case 'file_exists':
      return context.readFile(spec.path) === null
        ? fail(`File ${spec.path} was not created`)
        : pass(`File ${spec.path} exists`);
    case 'tool_called': {
      const count = context.toolCalls.filter((call) => call.tool === spec.tool).length;
      const range =
        spec.max === undefined
          ? `at least ${String(spec.min)}`
          : `${String(spec.min)}–${String(spec.max)}`;
      const within = count >= spec.min && (spec.max === undefined || count <= spec.max);
      const message = `${spec.tool} called ${String(count)} time(s); expected ${range}`;
      return within ? pass(message) : fail(message);
    }
  }
}

function resolveTarget(target: ScorerTarget, context: ScoringContext): string | null {
  return target.kind === 'final_output' ? context.finalOutput : context.readFile(target.path);
}

function describeTarget(target: ScorerTarget): string {
  return target.kind === 'final_output' ? 'Final output' : `File ${target.path}`;
}

function defaultLabel(spec: ScorerSpec): string {
  switch (spec.type) {
    case 'contains':
      return `${describeTarget(spec.target)} contains ${preview(spec.value, 40)}`;
    case 'regex':
      return `${describeTarget(spec.target)} matches /${spec.pattern}/`;
    case 'json_valid':
      return `${describeTarget(spec.target)} is valid JSON`;
    case 'json_field':
      return `${describeTarget(spec.target)} → ${spec.path || 'root'}`;
    case 'file_exists':
      return `File ${spec.path} exists`;
    case 'tool_called':
      return `Uses ${spec.tool}`;
    case 'llm_judge':
      return `Judge: ${spec.criteria.map((criterion) => criterion.key).join(', ')}`;
  }
}
