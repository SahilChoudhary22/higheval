import { join } from 'node:path';
import { WORKSPACE_DIRNAME } from '../execution/agent-executor.js';

/** Directory owned by one attempt of a run: `<DATA_DIR>/runs/<runId>/attempt-<n>`. */
export function runAttemptDir(dataDir: string, runId: string, attempt: number): string {
  return join(dataDir, 'runs', runId, `attempt-${String(attempt)}`);
}

/** The agent's working directory inside a run attempt. */
export function runWorkspaceDir(dataDir: string, runId: string, attempt: number): string {
  return join(runAttemptDir(dataDir, runId, attempt), WORKSPACE_DIRNAME);
}

/** All attempts of a run, for cleanup. */
export function runDir(dataDir: string, runId: string): string {
  return join(dataDir, 'runs', runId);
}
