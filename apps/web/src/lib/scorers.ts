import type { ScorerSpec, ScorerTarget } from '@higheval/shared';

const target = (value: ScorerTarget): string =>
  value.kind === 'final_output' ? 'final reply' : value.path;

/** Human-readable summary of what a scorer checks, for suite inspection. */
export function describeScorer(spec: ScorerSpec): { kind: string; on: string; check: string } {
  switch (spec.type) {
    case 'contains':
      return {
        kind: 'Contains',
        on: target(spec.target),
        check: `“${spec.value}”${spec.caseSensitive ? ' (case-sensitive)' : ''}`,
      };
    case 'regex':
      return { kind: 'Matches', on: target(spec.target), check: `/${spec.pattern}/${spec.flags}` };
    case 'json_valid':
      return { kind: 'Valid JSON', on: target(spec.target), check: 'parses as JSON' };
    case 'json_field': {
      const extras = [
        spec.tolerance === undefined ? null : `±${String(spec.tolerance)}`,
        spec.unordered ? 'any order' : null,
      ].filter(Boolean);
      return {
        kind: 'JSON field',
        on: `${target(spec.target)} → ${spec.path || 'root'}`,
        check: `= ${JSON.stringify(spec.expected)}${extras.length ? ` (${extras.join(', ')})` : ''}`,
      };
    }
    case 'file_exists':
      return { kind: 'File exists', on: spec.path, check: 'created by the agent' };
    case 'tool_called':
      return {
        kind: 'Tool used',
        on: spec.tool,
        check:
          spec.max === undefined
            ? `≥ ${String(spec.min)}×`
            : `${String(spec.min)}–${String(spec.max)}×`,
      };
  }
}
