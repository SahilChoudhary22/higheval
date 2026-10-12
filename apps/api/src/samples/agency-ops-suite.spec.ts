import { suiteInputSchema } from '@higheval/shared';
import { scoreTask } from '../scoring/scorers.js';
import { AGENCY_OPS_SUITE } from './agency-ops-suite.js';

/**
 * Reference solutions: what a perfect agent would leave behind. Every task
 * must score exactly 1 against them, which catches typos in expected values,
 * paths and regexes before they silently penalize real agents.
 */
const REFERENCE: Record<string, { files?: Record<string, unknown>; output?: string }> = {
  'overdue-invoices': {
    files: {
      'overdue.json': {
        overdue_ids: ['INV-2042', 'INV-2043', 'INV-2046', 'INV-2047'],
        overdue_total: 5800.5,
        largest_debtor: 'Cedar Law Group',
      },
    },
  },
  'lead-qualification': {
    files: { 'qualified.json': { qualified: ['L-101', 'L-104', 'L-106'] } },
    output: '3 leads qualified.',
  },
  'appointment-conflicts': {
    files: {
      'conflicts.json': {
        conflicts: [
          ['A1', 'A2'],
          ['A5', 'A6'],
          ['A7', 'A8'],
        ],
      },
    },
  },
  'refund-within-window': { output: '{"decision": "approve", "policy_clause": "30 days, unused"}' },
  'refund-opened-software': {
    output: '```json\n{"decision": "deny", "policy_clause": "opened software"}\n```',
  },
  'contact-extraction': {
    files: {
      'contact.json': {
        name: 'Rosa Delgado',
        company: 'Delgado Plumbing & Heating',
        phone_e164: '+15105550192',
        service: 'Google Ads management',
        preferred_date: '2026-10-22',
      },
    },
  },
  'pipeline-forecast': {
    files: {
      'forecast.json': {
        stage_totals: {
          Discovery: 16000,
          Proposal: 14700,
          Negotiation: 18300,
          'Closed Won': 9800,
          'Closed Lost': 7000,
        },
        open_pipeline: 49000,
        weighted_forecast: 20290,
      },
    },
  },
  'duplicate-contacts': {
    files: {
      'duplicates.json': {
        groups: [
          ['C1', 'C3'],
          ['C2', 'C7'],
          ['C4', 'C5'],
        ],
      },
    },
  },
  'sms-quiet-hours': { files: { 'violations.json': { violations: ['M3', 'M4', 'M6'] } } },
  'campaign-roi': {
    output: '{"best_campaign": "Reactivation", "best_roi": 3.5, "overall_roi": 1.88}',
  },
  'churn-risk': {
    files: {
      'churn.json': {
        tiers: {
          'Brightline Dental': 'low',
          'Harbor Fitness': 'high',
          'Oakridge Realty': 'medium',
          'Summit Roofing': 'medium',
          'Lumen Spa': 'high',
          'Cedar Law Group': 'high',
          'Pinecrest Vet': 'low',
        },
        high_risk_seats: 30,
      },
    },
  },
  'support-sla-breaches': { files: { 'breaches.json': { breached: ['T-302', 'T-304', 'T-306'] } } },
};

describe('Agency operations sample suite', () => {
  const suite = suiteInputSchema.parse(AGENCY_OPS_SUITE);

  it('is a valid suite with a reference solution for every task', () => {
    expect(suite.tasks).toHaveLength(12);
    expect(Object.keys(REFERENCE).toSorted()).toEqual(
      suite.tasks.map((task) => task.key).toSorted(),
    );
  });

  it.each(suite.tasks.map((task) => [task.key, task] as const))(
    '%s scores 1 for its reference solution',
    (key, task) => {
      const reference = REFERENCE[key] ?? {};
      const files = Object.fromEntries(
        Object.entries(reference.files ?? {}).map(([path, value]) => [
          path,
          JSON.stringify(value, null, 2),
        ]),
      );
      const result = scoreTask(
        task.scorers,
        {
          finalOutput: reference.output ?? 'Done.',
          readFile: (path) => files[path] ?? null,
          toolCalls: [],
        },
        task.passThreshold,
      );
      expect(result.results.filter((entry) => !entry.passed)).toEqual([]);
      expect(result.score).toBe(1);
    },
  );

  it('keeps expected answers out of the fixtures the agent can read', () => {
    for (const task of suite.tasks) {
      const answers = task.scorers.flatMap((scorer) =>
        scorer.type === 'json_field' ? [JSON.stringify(scorer.expected)] : [],
      );
      for (const fixture of task.fixtures) {
        for (const answer of answers.filter((value) => value.length > 12)) {
          expect(fixture.content).not.toContain(answer);
        }
      }
    }
  });
});
