import { resolve } from 'node:path';

/**
 * Absolute path of the repository root. This file lives at
 * `apps/api/{src,dist}/config/`, so the root is four levels up in both
 * source and compiled layouts.
 */
export const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
