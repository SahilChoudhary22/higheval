import { spawn } from 'node:child_process';

export interface ProcessSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface ProcessHandlers {
  onStdout(chunk: string): void;
  onStderr(chunk: string): void;
}

export interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Why we stopped the process, if we did. */
  stoppedBy: 'abort' | 'timeout' | null;
  spawnError: Error | null;
}

const KILL_GRACE_MS = 5_000;

/**
 * Spawns a child in its own process group (so tools it starts die with it),
 * streams output, and enforces a hard deadline and cancellation with
 * SIGTERM → SIGKILL escalation. Never uses a shell: arguments are passed as an
 * array, so prompts and paths cannot be interpreted as shell syntax.
 */
export function runProcess(
  spec: ProcessSpec,
  handlers: ProcessHandlers,
  limits: { signal: AbortSignal; hardTimeoutMs: number },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stoppedBy: ProcessResult['stoppedBy'] = null;
    let spawnError: Error | null = null;
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => handlers.onStdout(chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => handlers.onStderr(chunk));

    const killGroup = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Already exited.
      }
    };
    const stop = (reason: 'abort' | 'timeout'): void => {
      if (stoppedBy) return;
      stoppedBy = reason;
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
    };

    const deadline = setTimeout(() => stop('timeout'), limits.hardTimeoutMs);
    const onAbort = (): void => stop('abort');
    if (limits.signal.aborted) onAbort();
    else limits.signal.addEventListener('abort', onAbort, { once: true });

    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      limits.signal.removeEventListener('abort', onAbort);
      resolve({ exitCode, signal, stoppedBy, spawnError });
    });
  });
}
