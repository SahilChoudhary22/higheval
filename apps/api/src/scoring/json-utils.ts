import type { JsonValue } from '@higheval/shared';
import { isRecord } from '../common/guards.js';

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Parses JSON from free-form model output. Tries, in order: the whole text, the
 * first fenced ```json block, then the first balanced {...} or [...] span.
 * Models often wrap JSON in prose or fences; strict parsing of the whole reply
 * would measure formatting habits rather than task correctness.
 */
export function extractJson(text: string): ParseResult {
  const candidates = [text.trim()];
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const span = firstBalancedSpan(text);
  if (span) candidates.push(span);

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false, error: 'No parseable JSON found' };
}

function firstBalancedSpan(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
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
      if (stack.length === 0) return text.slice(start, index + 1);
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
}

/**
 * Structural equality with optional numeric tolerance and order-insensitive
 * arrays. Strings are compared after trimming; numbers within `tolerance`.
 */
export function jsonMatches(actual: unknown, expected: JsonValue, options: MatchOptions): boolean {
  if (typeof expected === 'number') {
    const value = typeof actual === 'string' && actual.trim() !== '' ? Number(actual) : actual;
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
    const remaining = [...actual];
    return expected.every((item) => {
      const index = remaining.findIndex((candidate) => jsonMatches(candidate, item, options));
      if (index === -1) return false;
      remaining.splice(index, 1);
      return true;
    });
  }
  if (!isRecord(actual)) return false;
  return Object.entries(expected).every(
    ([key, value]) => Object.hasOwn(actual, key) && jsonMatches(actual[key], value, options),
  );
}

/** Compact, length-limited rendering for scorer reasons. */
export function preview(value: unknown, limit = 120): string {
  const text =
    typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? 'undefined');
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
