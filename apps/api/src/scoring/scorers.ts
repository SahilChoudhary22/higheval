import type { ScoreResult, ScorerSpec, ScorerTarget } from '@higheval/shared';
import { extractJson, getAtPath, jsonMatches, preview } from './json-utils.js';

/** Everything a scorer may inspect about a finished run. */
export interface ScoringContext {
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
}

type Outcome = Pick<ScoreResult, 'passed' | 'score' | 'reason'>;

const pass = (reason: string): Outcome => ({ passed: true, score: 1, reason });
const fail = (reason: string): Outcome => ({ passed: false, score: 0, reason });

export function scoreTask(
  scorers: readonly ScorerSpec[],
  context: ScoringContext,
  passThreshold: number,
): TaskScore {
  const results = scorers.map((spec, scorerIndex): ScoreResult => {
    const outcome = evaluate(spec, context);
    return {
      scorerIndex,
      type: spec.type,
      label: spec.label ?? defaultLabel(spec),
      weight: spec.weight,
      ...outcome,
    };
  });
  const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : results.reduce((sum, result) => sum + result.score * result.weight, 0) / totalWeight;
  // Round away floating-point noise so a perfect run compares equal to 1.
  const rounded = Math.round(score * 1e9) / 1e9;
  return { results, score: rounded, passed: rounded >= passThreshold };
}

function evaluate(spec: ScorerSpec, context: ScoringContext): Outcome {
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
      const match = new RegExp(spec.pattern, spec.flags).exec(text);
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
  }
}
