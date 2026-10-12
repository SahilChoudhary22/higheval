import type { SuiteInput } from '@higheval/shared';
import { AGENCY_OPS_SUITE } from './agency-ops-suite.js';

/** Tasks that need only one to three model calls, chosen for a fast end-to-end check. */
const QUICK_TASK_KEYS = [
  'refund-within-window',
  'refund-opened-software',
  'campaign-roi',
  'lead-qualification',
  'overdue-invoices',
] as const;

/**
 * A five-task subset of the agency suite for trying the platform: one
 * repetition per arm (10 runs) finished in 41 s on free model endpoints, and
 * five paired tasks is the minimum the decision rule accepts.
 */
export const QUICK_CHECK_SUITE: SuiteInput = {
  name: 'Quick check',
  description:
    'Five fast tasks from Agency operations (two policy decisions, one ROI calculation, lead qualification and overdue receivables). One repetition takes about a minute on free models; use the full suite for decisions.',
  tasks: QUICK_TASK_KEYS.map((key) => {
    const task = AGENCY_OPS_SUITE.tasks.find((candidate) => candidate.key === key);
    if (!task) throw new Error(`Quick-check task ${key} is missing from the agency suite`);
    return task;
  }),
};
