import type { RunProgress } from '@higheval/shared';

/**
 * Typical wall-clock seconds per agent run on free OpenRouter endpoints,
 * measured over 160 runs (mean 38–52 s; ~95% of it waiting on the model).
 */
export const TYPICAL_RUN_SECONDS = 40;

/** Rough duration of an experiment before it starts. */
export function estimateDurationMs(runs: number, concurrency: number): number {
  return Math.ceil(runs / Math.max(1, concurrency)) * TYPICAL_RUN_SECONDS * 1000;
}

/**
 * Remaining time for a running experiment, extrapolated from its own pace so
 * far. Null until at least one run has finished.
 */
export function estimateRemainingMs(
  progress: RunProgress,
  startedAt: string | null,
  now: number = Date.now(),
): number | null {
  const finished = progress.scored + progress.errored + progress.cancelled;
  if (!startedAt || finished === 0) return null;
  const elapsed = now - Date.parse(startedAt);
  if (elapsed <= 0) return null;
  return ((progress.total - finished) * elapsed) / finished;
}

/** "under a minute", "about 3 min", "about 1 h 20 min". */
export function formatApproxDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `about ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${String(hours)} h${rest ? ` ${String(rest)} min` : ''}`;
}
