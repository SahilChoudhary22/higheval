import type { SuiteInput } from '@higheval/shared';

/**
 * Sample suite: back-office tasks a marketing/CRM agency handles every day.
 * All data is synthetic. Each task has one objectively correct answer and
 * includes deliberate edge cases (boundary dates, partial payments, time-zone
 * conversions, near-duplicate records) so stronger agents can separate from
 * weaker ones. Expected values were computed by script, not by hand.
 */

const fileJson = (path: string) => ({ kind: 'file' as const, path });
const finalOutput = { kind: 'final_output' as const };

export const AGENCY_OPS_SUITE: SuiteInput = {
  name: 'Agency operations',
  description:
    'Twelve synthetic back-office tasks for a marketing agency: billing, CRM hygiene, scheduling, compliance and reporting. Every task has a single correct answer checked by deterministic scorers.',
  tasks: [
    {
      key: 'overdue-invoices',
      title: 'Overdue receivables',
      tags: ['billing', 'files'],
      prompt: [
        'You are an accounts-receivable assistant. Today is 2026-10-01.',
        'Read invoices.csv. An invoice is overdue when its unpaid balance (amount − paid) is greater than zero and its due_date is strictly before today.',
        'Write overdue.json with exactly these keys:',
        '{"overdue_ids": [invoice ids, ascending], "overdue_total": <sum of unpaid balances, 2 decimals>, "largest_debtor": "<client with the largest total overdue balance>"}',
        'Then reply with a one-sentence summary.',
      ].join('\n'),
      fixtures: [
        {
          path: 'invoices.csv',
          content: [
            'invoice_id,client,amount,paid,due_date',
            'INV-2041,Brightline Dental,1850.00,1850.00,2026-08-15',
            'INV-2042,Harbor Fitness,920.50,0.00,2026-09-10',
            'INV-2043,Oakridge Realty,2400.00,1000.00,2026-09-20',
            'INV-2044,Summit Roofing,675.25,0.00,2026-10-05',
            'INV-2045,Lumen Spa,1310.00,1310.00,2026-09-01',
            'INV-2046,Harbor Fitness,480.00,0.00,2026-09-28',
            'INV-2047,Cedar Law Group,3150.75,150.75,2026-08-30',
            'INV-2048,Pinecrest Vet,560.00,0.00,2026-10-01',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        { type: 'file_exists', path: 'overdue.json' },
        {
          type: 'json_field',
          target: fileJson('overdue.json'),
          path: 'overdue_ids',
          expected: ['INV-2042', 'INV-2043', 'INV-2046', 'INV-2047'],
          weight: 2,
        },
        {
          type: 'json_field',
          target: fileJson('overdue.json'),
          path: 'overdue_total',
          expected: 5800.5,
          tolerance: 0.01,
          weight: 2,
        },
        {
          type: 'json_field',
          target: fileJson('overdue.json'),
          path: 'largest_debtor',
          expected: 'Cedar Law Group',
        },
      ],
    },
    {
      key: 'lead-qualification',
      title: 'Qualify inbound leads',
      tags: ['crm', 'files'],
      prompt: [
        'Read leads.json. A lead is qualified only if ALL of these hold:',
        '- budget_usd is at least 2000',
        '- timeline_days is at most 90',
        '- role is a decision maker: Owner, Director, Partner, VP or CEO',
        '- employees is at least 5',
        'Write qualified.json as {"qualified": [lead ids, ascending]}. Reply with how many leads qualified.',
      ].join('\n'),
      fixtures: [
        {
          path: 'leads.json',
          content: `${JSON.stringify(
            [
              {
                id: 'L-101',
                company: 'Brightline Dental',
                budget_usd: 5000,
                timeline_days: 30,
                role: 'Owner',
                employees: 14,
              },
              {
                id: 'L-102',
                company: 'Harbor Fitness',
                budget_usd: 1500,
                timeline_days: 20,
                role: 'Manager',
                employees: 6,
              },
              {
                id: 'L-103',
                company: 'Oakridge Realty',
                budget_usd: 8000,
                timeline_days: 120,
                role: 'Director',
                employees: 40,
              },
              {
                id: 'L-104',
                company: 'Summit Roofing',
                budget_usd: 3000,
                timeline_days: 45,
                role: 'Owner',
                employees: 9,
              },
              {
                id: 'L-105',
                company: 'Lumen Spa',
                budget_usd: 2000,
                timeline_days: 60,
                role: 'Intern',
                employees: 12,
              },
              {
                id: 'L-106',
                company: 'Cedar Law Group',
                budget_usd: 12000,
                timeline_days: 90,
                role: 'Partner',
                employees: 55,
              },
              {
                id: 'L-107',
                company: 'Pinecrest Vet',
                budget_usd: 2000,
                timeline_days: 10,
                role: 'Owner',
                employees: 3,
              },
            ],
            null,
            2,
          )}\n`,
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('qualified.json'),
          path: 'qualified',
          expected: ['L-101', 'L-104', 'L-106'],
          weight: 3,
        },
        { type: 'regex', target: finalOutput, pattern: '\\b(3|three)\\b', flags: 'i' },
      ],
    },
    {
      key: 'appointment-conflicts',
      title: 'Find double bookings',
      tags: ['scheduling', 'files'],
      prompt: [
        'Read appointments.csv. Two appointments conflict when they belong to the same staff member and their time ranges overlap. An appointment that starts exactly when another ends does not conflict.',
        'Write conflicts.json as {"conflicts": [["A1","A2"], ...]} where each pair is sorted and the list is sorted. Reply with the number of conflicts.',
      ].join('\n'),
      fixtures: [
        {
          path: 'appointments.csv',
          content: [
            'id,staff,start,end',
            'A1,Maya,2026-10-14 09:00,2026-10-14 10:00',
            'A2,Maya,2026-10-14 09:45,2026-10-14 10:30',
            'A3,Jon,2026-10-14 09:00,2026-10-14 09:30',
            'A4,Maya,2026-10-14 10:30,2026-10-14 11:00',
            'A5,Jon,2026-10-14 09:30,2026-10-14 10:15',
            'A6,Jon,2026-10-14 10:00,2026-10-14 10:45',
            'A7,Priya,2026-10-14 13:00,2026-10-14 14:00',
            'A8,Priya,2026-10-14 13:59,2026-10-14 14:30',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('conflicts.json'),
          path: 'conflicts',
          expected: [
            ['A1', 'A2'],
            ['A5', 'A6'],
            ['A7', 'A8'],
          ],
          unordered: true,
          weight: 3,
        },
      ],
    },
    {
      key: 'refund-within-window',
      title: 'Refund: eligible purchase',
      tags: ['policy'],
      prompt: [
        'Refund policy: physical items may be refunded within 30 days of purchase if unused. Opened software licences are never refundable. Gift cards are never refundable.',
        'Case: a customer bought noise-cancelling headphones 12 days ago. The box is still sealed.',
        'Reply with ONLY a JSON object: {"decision": "approve" | "deny", "policy_clause": "<the clause you applied>"}.',
      ].join('\n'),
      scorers: [
        { type: 'json_valid', target: finalOutput },
        {
          type: 'json_field',
          target: finalOutput,
          path: 'decision',
          expected: 'approve',
          weight: 3,
        },
      ],
    },
    {
      key: 'refund-opened-software',
      title: 'Refund: opened software',
      tags: ['policy'],
      prompt: [
        'Refund policy: physical items may be refunded within 30 days of purchase if unused. Opened software licences are never refundable. Gift cards are never refundable.',
        'Case: a customer bought a design-software licence 5 days ago, activated it once, and now says it is "basically unused" and wants a refund.',
        'Reply with ONLY a JSON object: {"decision": "approve" | "deny", "policy_clause": "<the clause you applied>"}.',
      ].join('\n'),
      scorers: [
        { type: 'json_valid', target: finalOutput },
        { type: 'json_field', target: finalOutput, path: 'decision', expected: 'deny', weight: 3 },
      ],
    },
    {
      key: 'contact-extraction',
      title: 'Extract a contact from an email',
      tags: ['crm', 'extraction', 'files'],
      prompt: [
        'Read inquiry.eml and extract the sender as a CRM contact.',
        'Write contact.json with exactly: {"name": "...", "company": "...", "phone_e164": "+1XXXXXXXXXX", "service": "...", "preferred_date": "YYYY-MM-DD"}.',
        'Use the phone number the sender asks to be called on. The email was sent on 2026-10-12; resolve relative dates against that.',
      ].join('\n'),
      fixtures: [
        {
          path: 'inquiry.eml',
          content: [
            'From: Rosa Delgado <rosa@delgadoplumbing.com>',
            'Date: Mon, 12 Oct 2026 09:14:00 -0700',
            'Subject: Quote for Google Ads management',
            '',
            'Hi there,',
            '',
            "I run Delgado Plumbing & Heating and we're looking for someone to manage our Google Ads.",
            'Our office line is (510) 555-0148 but please call my cell instead: 510.555.0192.',
            'This week is packed, so could we do a call on Thursday of the following week? Mornings work best.',
            '',
            'Thanks,',
            'Rosa',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('contact.json'),
          path: 'name',
          expected: 'Rosa Delgado',
        },
        {
          type: 'json_field',
          target: fileJson('contact.json'),
          path: 'phone_e164',
          expected: '+15105550192',
          weight: 2,
        },
        {
          type: 'json_field',
          target: fileJson('contact.json'),
          path: 'preferred_date',
          expected: '2026-10-22',
          weight: 2,
        },
        {
          type: 'regex',
          target: fileJson('contact.json'),
          pattern: '"company"\\s*:\\s*"Delgado Plumbing',
          label: 'Company is Delgado Plumbing…',
        },
        {
          type: 'regex',
          target: fileJson('contact.json'),
          pattern: '"service"\\s*:\\s*"[^"]*google ads',
          flags: 'i',
          label: 'Service mentions Google Ads',
        },
      ],
    },
    {
      key: 'pipeline-forecast',
      title: 'Weighted pipeline forecast',
      tags: ['reporting', 'files'],
      prompt: [
        'Read deals.csv. Stage win probabilities: Discovery 10%, Proposal 40%, Negotiation 70%. Closed Won and Closed Lost deals are not part of the open pipeline.',
        'Write forecast.json as {"stage_totals": {"<stage>": <sum of amounts>, ... for every stage present}, "open_pipeline": <sum of open deal amounts>, "weighted_forecast": <sum of amount × probability over open deals>}.',
      ].join('\n'),
      fixtures: [
        {
          path: 'deals.csv',
          content: [
            'deal,stage,amount',
            'D-01,Discovery,12000',
            'D-02,Proposal,8500',
            'D-03,Negotiation,15000',
            'D-04,Discovery,4000',
            'D-05,Closed Won,9800',
            'D-06,Proposal,6200',
            'D-07,Closed Lost,7000',
            'D-08,Negotiation,3300',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('forecast.json'),
          path: 'stage_totals',
          expected: {
            Discovery: 16000,
            Proposal: 14700,
            Negotiation: 18300,
            'Closed Won': 9800,
            'Closed Lost': 7000,
          },
        },
        {
          type: 'json_field',
          target: fileJson('forecast.json'),
          path: 'open_pipeline',
          expected: 49000,
          weight: 2,
        },
        {
          type: 'json_field',
          target: fileJson('forecast.json'),
          path: 'weighted_forecast',
          expected: 20290,
          tolerance: 0.5,
          weight: 2,
        },
      ],
    },
    {
      key: 'duplicate-contacts',
      title: 'Merge duplicate contacts',
      tags: ['crm', 'files'],
      prompt: [
        'Read contacts.csv. Two contacts are duplicates if their emails match after trimming whitespace and lower-casing, OR their phone numbers match after removing every non-digit and comparing the last 10 digits. Duplicates are transitive.',
        'Write duplicates.json as {"groups": [["C1","C3"], ...]} listing only groups with two or more contacts; sort ids within each group and sort the groups.',
      ].join('\n'),
      fixtures: [
        {
          path: 'contacts.csv',
          content: [
            'id,name,email,phone',
            'C1,Ana Ruiz,ana.ruiz@brightline.com,(415) 555-0134',
            'C2,Ben Ortiz,ben@harborfit.com,415-555-0199',
            'C3,Ana Ruiz,Ana.Ruiz@Brightline.com ,415.555.0134',
            'C4,Chloe Park,chloe@oakridge.co,+1 650 555 0101',
            'C5,C. Park,cpark@oakridge.co,650-555-0101',
            'C6,Dev Shah,dev@summitroof.com,510-555-0177',
            'C7,Ben Ortiz,benortiz@gmail.com,(415) 555-0199',
            'C8,Eli Moss,eli@lumenspa.com,510-555-0123',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('duplicates.json'),
          path: 'groups',
          expected: [
            ['C1', 'C3'],
            ['C2', 'C7'],
            ['C4', 'C5'],
          ],
          unordered: true,
          weight: 3,
        },
      ],
    },
    {
      key: 'sms-quiet-hours',
      title: 'SMS quiet-hours compliance',
      tags: ['compliance', 'timezones', 'files'],
      prompt: [
        "Read scheduled_sms.csv. Messages must not be delivered during quiet hours: from 21:00 (inclusive) to 08:00 (exclusive) in the contact's local time zone.",
        'Write violations.json as {"violations": [message ids, ascending]}.',
      ].join('\n'),
      fixtures: [
        {
          path: 'scheduled_sms.csv',
          content: [
            'message_id,contact,timezone,send_at_utc',
            'M1,Ana,America/Los_Angeles,2026-10-14T03:30:00Z',
            'M2,Ben,America/New_York,2026-10-14T12:15:00Z',
            'M3,Chloe,Europe/London,2026-10-14T20:30:00Z',
            'M4,Dev,Asia/Kolkata,2026-10-14T02:00:00Z',
            'M5,Eli,America/Chicago,2026-10-14T13:00:00Z',
            'M6,Fay,Australia/Sydney,2026-10-14T12:00:00Z',
            'M7,Gus,America/Denver,2026-10-15T02:59:00Z',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('violations.json'),
          path: 'violations',
          expected: ['M3', 'M4', 'M6'],
          weight: 3,
        },
      ],
    },
    {
      key: 'campaign-roi',
      title: 'Campaign ROI ranking',
      tags: ['reporting'],
      prompt: [
        'Campaign results this quarter (spend → attributed revenue, USD):',
        '- Fall Promo (Facebook): 1200 → 3900',
        '- Reactivation (Email): 300 → 1350',
        '- Review Drive (SMS): 450 → 1125',
        '- Local SEO (Google): 2000 → 5200',
        '- Referral Push (Email): 250 → 500',
        'ROI = (revenue − spend) / spend.',
        'Reply with ONLY a JSON object: {"best_campaign": "<name>", "best_roi": <2 decimals>, "overall_roi": <ROI of all campaigns combined, 2 decimals>}.',
      ].join('\n'),
      scorers: [
        {
          type: 'json_field',
          target: finalOutput,
          path: 'best_campaign',
          expected: 'Reactivation',
          weight: 2,
        },
        {
          type: 'json_field',
          target: finalOutput,
          path: 'best_roi',
          expected: 3.5,
          tolerance: 0.005,
        },
        {
          type: 'json_field',
          target: finalOutput,
          path: 'overall_roi',
          expected: 1.88,
          tolerance: 0.005,
          weight: 2,
        },
      ],
    },
    {
      key: 'churn-risk',
      title: 'Churn-risk tiers',
      tags: ['crm', 'files'],
      prompt: [
        'Read accounts.csv and assign each account a churn-risk tier:',
        '- high: days_since_login > 30 OR open_tickets >= 3',
        '- medium (if not high): days_since_login > 14 OR open_tickets >= 1',
        '- low: everything else',
        'Write churn.json as {"tiers": {"<account>": "high" | "medium" | "low", ...}, "high_risk_seats": <total seats across high-risk accounts>}.',
      ].join('\n'),
      fixtures: [
        {
          path: 'accounts.csv',
          content: [
            'account,days_since_login,open_tickets,seats',
            'Brightline Dental,3,0,12',
            'Harbor Fitness,45,0,4',
            'Oakridge Realty,10,2,8',
            'Summit Roofing,16,0,3',
            'Lumen Spa,2,3,6',
            'Cedar Law Group,31,1,20',
            'Pinecrest Vet,14,0,5',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('churn.json'),
          path: 'tiers',
          expected: {
            'Brightline Dental': 'low',
            'Harbor Fitness': 'high',
            'Oakridge Realty': 'medium',
            'Summit Roofing': 'medium',
            'Lumen Spa': 'high',
            'Cedar Law Group': 'high',
            'Pinecrest Vet': 'low',
          },
          weight: 3,
        },
        {
          type: 'json_field',
          target: fileJson('churn.json'),
          path: 'high_risk_seats',
          expected: 30,
        },
      ],
    },
    {
      key: 'support-sla-breaches',
      title: 'Support SLA breaches',
      tags: ['support', 'files'],
      prompt: [
        'Read tickets.csv. First-response SLAs: urgent 1 hour, high 4 hours, normal 24 hours. A ticket breaches when the time from created_utc to first_response_utc is strictly longer than its SLA. Tickets without a response are measured up to now: 2026-10-14T18:00:00Z.',
        'Write breaches.json as {"breached": [ticket ids, ascending]}.',
      ].join('\n'),
      fixtures: [
        {
          path: 'tickets.csv',
          content: [
            'ticket_id,priority,created_utc,first_response_utc',
            'T-301,urgent,2026-10-14T08:00:00Z,2026-10-14T08:40:00Z',
            'T-302,urgent,2026-10-14T09:10:00Z,2026-10-14T10:25:00Z',
            'T-303,high,2026-10-14T07:00:00Z,2026-10-14T11:00:00Z',
            'T-304,high,2026-10-14T06:30:00Z,2026-10-14T10:45:00Z',
            'T-305,normal,2026-10-13T12:00:00Z,2026-10-14T11:00:00Z',
            'T-306,normal,2026-10-13T09:00:00Z,',
            'T-307,high,2026-10-14T15:30:00Z,',
            'T-308,urgent,2026-10-14T17:30:00Z,',
            '',
          ].join('\n'),
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: fileJson('breaches.json'),
          path: 'breached',
          expected: ['T-302', 'T-304', 'T-306'],
          weight: 3,
        },
      ],
    },
  ],
};
