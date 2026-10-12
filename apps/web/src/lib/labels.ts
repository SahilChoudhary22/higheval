import type { ExperimentStatus, RunStatus, Termination, Verdict } from '@higheval/shared';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CircleDashed,
  CircleHelp,
  Clock,
  Ellipsis,
  Equal,
  LoaderCircle,
  TriangleAlert,
} from '@lucide/vue';
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
    icon: ArrowUp,
  },
  candidate_worse: {
    label: 'Worse',
    sentence: 'Candidate is worse',
    tone: 'worse',
    icon: ArrowDown,
  },
  practically_equivalent: {
    label: 'Equivalent',
    sentence: 'Practically equivalent',
    tone: 'equiv',
    icon: Equal,
  },
  inconclusive: {
    label: 'Inconclusive',
    sentence: 'Inconclusive',
    tone: 'inconc',
    icon: CircleHelp,
  },
  insufficient_data: {
    label: 'Not enough data',
    sentence: 'Not enough data',
    tone: 'missing',
    icon: Ellipsis,
  },
};

export const RUN_STATUS: Record<RunStatus, TagSpec> = {
  queued: { label: 'Queued', tone: 'neutral', icon: CircleDashed },
  running: { label: 'Running', tone: 'running', icon: LoaderCircle, spin: true },
  scored: { label: 'Scored', tone: 'equiv', icon: Check },
  errored: { label: 'Errored', tone: 'error', icon: TriangleAlert },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
};

export const EXPERIMENT_STATUS: Record<ExperimentStatus, TagSpec> = {
  queued: { label: 'Queued', tone: 'neutral', icon: CircleDashed },
  running: { label: 'Running', tone: 'running', icon: LoaderCircle, spin: true },
  completed: { label: 'Completed', tone: 'equiv', icon: Check },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
  failed: { label: 'Failed', tone: 'error', icon: TriangleAlert },
};

export const TERMINATION: Record<Termination, string> = {
  completed: 'Finished',
  timeout: 'Timed out',
  max_turns: 'Hit turn limit',
};

export const TIMEOUT_TAG: TagSpec = { label: 'Timed out', tone: 'inconc', icon: Clock };

export const shortId = (id: string): string => id.slice(0, 8);
