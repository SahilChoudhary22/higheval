import type { SuiteInput } from '@higheval/shared';

/** What applying a draft would change in the suite currently in the editor, by task key. */
export interface SuiteChanges {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
  /** The suite's name or description differs. */
  detailsChanged: boolean;
}

/** JSON with object keys sorted, so key order never counts as a change. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : inner,
  );
}

export function suiteChanges(before: SuiteInput, after: SuiteInput): SuiteChanges {
  const old = new Map(before.tasks.map((task) => [task.key, canonical(task)]));
  const next = new Map(after.tasks.map((task) => [task.key, canonical(task)]));
  const changes: SuiteChanges = {
    added: [],
    removed: [],
    changed: [],
    unchanged: 0,
    detailsChanged:
      before.name !== after.name || (before.description ?? '') !== (after.description ?? ''),
  };
  for (const [key, task] of next) {
    const previous = old.get(key);
    if (previous === undefined) changes.added.push(key);
    else if (previous === task) changes.unchanged++;
    else changes.changed.push(key);
  }
  changes.removed = [...old.keys()].filter((key) => !next.has(key));
  return changes;
}
