import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { z } from 'zod';

export interface SessionStats {
  model: string | null;
  apiCalls: number | null;
  costUsd: number | null;
}

const sessionRowSchema = z.object({
  model: z.string().nullable(),
  api_call_count: z.number().nullable(),
  actual_cost_usd: z.number().nullable(),
  estimated_cost_usd: z.number().nullable(),
});

/**
 * Reads per-session accounting that Hermes persists but does not emit on the
 * stream: resolved model, API request count and cost. Best effort: a missing
 * or unexpected database yields nulls rather than failing the run.
 */
export function readSessionStats(stateDbPath: string, sessionId: string | null): SessionStats {
  const empty: SessionStats = { model: null, apiCalls: null, costUsd: null };
  if (!existsSync(stateDbPath)) return empty;
  let db: Database.Database | undefined;
  try {
    db = new Database(stateDbPath, { readonly: true, fileMustExist: true });
    const columns = 'model, api_call_count, actual_cost_usd, estimated_cost_usd';
    const raw: unknown = sessionId
      ? db.prepare(`SELECT ${columns} FROM sessions WHERE id = ?`).get(sessionId)
      : db.prepare(`SELECT ${columns} FROM sessions ORDER BY started_at DESC LIMIT 1`).get();
    const parsed = sessionRowSchema.safeParse(raw);
    if (!parsed.success) return empty;
    const row = parsed.data;
    return {
      model: row.model,
      apiCalls: row.api_call_count,
      costUsd: row.actual_cost_usd ?? row.estimated_cost_usd,
    };
  } catch {
    return empty;
  } finally {
    db?.close();
  }
}
