import type { JsonValue } from '@higheval/shared';
import { isRecord } from '../common/guards.js';

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Parses JSON from free-form model output. Tries, in order: the whole text,
 * fenced ```json blocks, then balanced {...} or [...] spans, preferring the
 * LAST candidate of each kind: models often show a draft or an example first
 * and their final answer last. Strict parsing of the whole reply would measure
 * formatting habits rather than task correctness.
 */
export function extractJson(text: string): ParseResult {
  const trimmed = text.trim();
  const fenced = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map((match) =>
    (match[1] ?? '').trim(),
  );
  const candidates = [trimmed, ...fenced.toReversed(), ...balancedSpans(text).toReversed()];
  for (const candidate of candidates) {
    if (candidate === '') continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false, error: 'No parseable JSON found' };
}

/** All top-level balanced {...} / [...] spans, in order of appearance. */
function balancedSpans(text: string): string[] {
  const spans: string[] = [];
  let index = 0;
  while (index < text.length) {
    const start = text.slice(index).search(/[[{]/);
    if (start === -1) break;
    const from = index + start;
    const end = spanEnd(text, from);
    if (end === null) {
      index = from + 1;
    } else {
      spans.push(text.slice(from, end + 1));
      index = end + 1;
    }
  }
  return spans;
}

/** Index of the bracket closing the one at `start`, ignoring brackets inside strings. */
function spanEnd(text: string, start: number): number | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return null;
      if (stack.length === 0) return index;
    }
  }
  return null;
}

/** Parses `a.b[0].c` into `['a', 'b', 0, 'c']`. An empty path selects the root. */
export function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  for (const match of path.matchAll(pattern)) {
    if (match[2] !== undefined) segments.push(Number(match[2]));
    else if (match[1] !== undefined) segments.push(match[1]);
  }
  return segments;
}

export type Lookup = { found: true; value: unknown } | { found: false };

export function getAtPath(root: unknown, path: string): Lookup {
  let current: unknown = root;
  for (const segment of parsePath(path)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return { found: false };
      current = current[segment];
    } else {
      if (!isRecord(current) || !Object.hasOwn(current, segment)) return { found: false };
      current = current[segment];
    }
  }
  return { found: true, value: current };
}

export interface MatchOptions {
  tolerance?: number | undefined;
  unordered?: boolean | undefined;
  /** Objects must have exactly the expected keys (no extras), at every level. */
  exact?: boolean | undefined;
}

/** A plain decimal number written as a string, e.g. "5800.50" (not "0x10" or "1e3"). */
const DECIMAL_STRING = /^-?\d+(?:\.\d+)?$/;

/**
 * Structural equality with optional numeric tolerance, order-insensitive
 * arrays and exact object keys. Strings are compared after trimming; numbers
 * within `tolerance` (plain decimal strings are accepted as numbers). Expected
 * objects are subsets of the actual object unless `exact` is set.
 */
export function jsonMatches(actual: unknown, expected: JsonValue, options: MatchOptions): boolean {
  if (typeof expected === 'number') {
    const value =
      typeof actual === 'string' && DECIMAL_STRING.test(actual.trim())
        ? Number(actual.trim())
        : actual;
    return typeof value === 'number' && Math.abs(value - expected) <= (options.tolerance ?? 0);
  }
  if (typeof expected === 'string') {
    return typeof actual === 'string' && actual.trim() === expected.trim();
  }
  if (expected === null || typeof expected === 'boolean') {
    return actual === expected;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    if (!options.unordered) {
      return expected.every((item, index) => jsonMatches(actual[index], item, options));
    }
    return hasPerfectMatching(expected, actual, (item, candidate) =>
      jsonMatches(candidate, item, options),
    );
  }
  if (!isRecord(actual)) return false;
  if (options.exact && Object.keys(actual).length !== Object.keys(expected).length) return false;
  return Object.entries(expected).every(
    ([key, value]) => Object.hasOwn(actual, key) && jsonMatches(actual[key], value, options),
  );
}

/**
 * Whether every expected item can be paired with a distinct actual item
 * (bipartite matching via augmenting paths). A greedy first-fit would reject
 * valid answers when tolerances let one actual item match several expected ones.
 */
function hasPerfectMatching<E, A>(
  expected: readonly E[],
  actual: readonly A[],
  matches: (item: E, candidate: A) => boolean,
): boolean {
  const compatible = expected.map((item) => actual.map((candidate) => matches(item, candidate)));
  const owner: number[] = Array.from({ length: actual.length }, () => -1);
  const assign = (item: number, seen: boolean[]): boolean => {
    for (let candidate = 0; candidate < actual.length; candidate++) {
      if (!compatible[item]?.[candidate] || seen[candidate]) continue;
      seen[candidate] = true;
      const current = owner[candidate] ?? -1;
      if (current === -1 || assign(current, seen)) {
        owner[candidate] = item;
        return true;
      }
    }
    return false;
  };
  return expected.every((_, item) =>
    assign(
      item,
      Array.from({ length: actual.length }, () => false),
    ),
  );
}

/** Compact, length-limited rendering for scorer reasons. */
export function preview(value: unknown, limit = 120): string {
  // Strings are quoted but not escaped, so reasons stay readable.
  const text = typeof value === 'string' ? `"${value}"` : (JSON.stringify(value) ?? 'undefined');
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
