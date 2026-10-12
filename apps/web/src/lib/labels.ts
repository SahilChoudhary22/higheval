import type { ExperimentStatus, RunStatus, Termination, Verdict } from '@higheval/shared';
import {
  PhArrowDown,
  PhArrowUp,
  PhCheck,
  PhCircleDashed,
  PhCircleNotch,
  PhClock,
  PhDotsThree,
  PhEquals,
  PhProhibit,
  PhQuestion,
  PhWarning,
} from '@phosphor-icons/vue';
import type { Component } from 'vue';

/** Visual tone of a tag; maps to a semantic colour pair in tokens.css. */
export type Tone =
  'neutral' | 'running' | 'better' | 'worse' | 'equiv' | 'inconc' | 'error' | 'missing';

export interface TagSpec {
  label: string;
  tone: Tone;
  icon: Component;
  spin?: boolean;
}

export const VERDICT: Record<Verdict, TagSpec & { sentence: string }> = {
  candidate_better: {
    label: 'Better',
    sentence: 'Candidate is better',
    tone: 'better',
    icon: PhArrowUp,
  },
  candidate_worse: {
    label: 'Worse',
    sentence: 'Candidate is worse',
    tone: 'worse',
    icon: PhArrowDown,
  },
  practically_equivalent: {
    label: 'Equivalent',
    sentence: 'Practically equivalent',
    tone: 'equiv',
    icon: PhEquals,
  },
  inconclusive: {
    label: 'Inconclusive',
    sentence: 'Inconclusive',
    tone: 'inconc',
    icon: PhQuestion,
  },
  insufficient_data: {
    label: 'Not enough data',
    sentence: 'Not enough data',
    tone: 'missing',
    icon: PhDotsThree,
  },
};

export const RUN_STATUS: Record<RunStatus, TagSpec> = {
  queued: { label: 'Queued', tone: 'neutral', icon: PhCircleDashed },
  running: { label: 'Running', tone: 'running', icon: PhCircleNotch, spin: true },
  scored: { label: 'Scored', tone: 'equiv', icon: PhCheck },
  errored: { label: 'Errored', tone: 'error', icon: PhWarning },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: PhProhibit },
};

export const EXPERIMENT_STATUS: Record<ExperimentStatus, TagSpec> = {
  queued: { label: 'Queued', tone: 'neutral', icon: PhCircleDashed },
  running: { label: 'Running', tone: 'running', icon: PhCircleNotch, spin: true },
  completed: { label: 'Completed', tone: 'equiv', icon: PhCheck },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: PhProhibit },
  failed: { label: 'Failed', tone: 'error', icon: PhWarning },
};

export const TERMINATION: Record<Termination, string> = {
  completed: 'Finished',
  timeout: 'Timed out',
  max_turns: 'Hit turn limit',
};

export const TIMEOUT_TAG: TagSpec = { label: 'Timed out', tone: 'inconc', icon: PhClock };

export const shortId = (id: string): string => id.slice(0, 8);
