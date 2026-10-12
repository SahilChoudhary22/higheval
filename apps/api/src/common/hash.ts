import { createHash } from 'node:crypto';
import { isRecord } from './guards.js';

/** JSON serialization with recursively sorted object keys, so equal values hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    isRecord(nested)
      ? Object.fromEntries(Object.entries(nested).toSorted(([a], [b]) => a.localeCompare(b)))
      : nested,
  );
}

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
