import type { JudgeUsage } from '@higheval/shared';

export interface JudgeCriterion {
  key: string;
  description: string;
}

export interface JudgeRequest {
  /** Exact model ID of the pinned judge. */
  model: string;
  rubric: string;
  criteria: readonly JudgeCriterion[];
  /** What the agent was asked to do, so the judge can assess relevance. */
  taskPrompt: string;
  /** The text being judged (the agent's reply or a file it wrote). */
  response: string;
  /** Human-readable name of what is judged, e.g. "Final reply". */
  responseLabel: string;
}

export interface JudgeVerdict {
  /** One entry per requested criterion, in request order. */
  criteria: { key: string; rating: number; reason: string }[];
  overallReason: string;
  usage: JudgeUsage;
}

/** Thrown when the judge cannot produce a usable verdict; the run is then marked `scoring`. */
export class JudgeError extends Error {
  override readonly name = 'JudgeError';
}

/**
 * Grades a response against a rubric. Implementations own the provider call;
 * scoring depends only on this interface, so tests substitute a fake judge.
 */
export abstract class Judge {
  abstract evaluate(request: JudgeRequest, signal?: AbortSignal): Promise<JudgeVerdict>;
}
