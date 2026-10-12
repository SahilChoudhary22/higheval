import { agentConfigInputSchema, skillInputSchema, suiteInputSchema } from '@higheval/shared';
import { scoreTask } from '../scoring/scorers.js';
import {
  CLIENT_MEMORY_ENTRIES,
  CLIENT_MEMORY_SUITE,
  FILE_READING_SUITE,
  HOUSE_STYLE_SKILL,
  HOUSE_STYLE_SUITE,
  SERVICE_CATALOG_SKILL,
  SERVICE_CATALOG_SUITE,
} from './capability-suites.js';
import { CAPABILITY_CONFIGS } from './sample-definitions.js';

/** The reply a configuration with the capability gives, for every task. */
const REFERENCE: Record<string, string> = {
  'catalog-service-code': '{"code": "LSD-PPC-330"}',
  'catalog-bundle-price': '{"monthly_price": 1399}',
  'catalog-bundle-prepay': '{"monthly_price": 1233}',
  'catalog-prepay-rounding': '{"monthly_price": 789}',
  'catalog-nonprofit-small': '{"monthly_price": 1224}',
  'catalog-nonprofit-best-deal': '{"monthly_price": 1984}',
  'catalog-support-target': 'Growth-plan clients get a first response within 8 business hours.',
  'catalog-escalation': 'Escalate it to Ravi Menon, our paid media lead.',
  'memory-account-manager': '{"account_manager": "Priya Raman"}',
  'memory-report-format': 'They want a shared Notion page, never email attachments.',
  'memory-retainer': '{"retainer": 4200, "billing_day": 15}',
  'memory-ad-pause': 'Avoid August: Lumen Spa pauses all advertising then.',
  'memory-contact': 'Call Marcus Bell before 10am; he ignores email.',
  'memory-budget-cap': '{"monthly_cap": 3500}',
  'memory-brand-colour': 'Their brand colour is #2e7d32.',
  'memory-fiscal-quarter': '{"fiscal_quarter": 3}',
  'files-unpaid-invoices': '{"unpaid_count": 3, "unpaid_total": 7040.50}',
  'files-largest-active-campaign': '{"campaign": "Back to School"}',
  'files-contact-email': '{"email": "m.bell@oakridge-realty.example"}',
  'files-reorder': '{"skus": ["SKU-A", "SKU-C", "SKU-D"]}',
  'files-meeting-date': '{"review_date": "2026-11-05"}',
  'files-error-count': '{"errors": 4}',
  'files-digest-setting': '{"digest": "biweekly-tue"}',
  'files-average-rating': '{"average": 7.88}',
  ...Object.fromEntries(
    [
      [
        'style-invoice-reminder',
        'Priya',
        'Invoice INV-2042 for USD 1,240.00 is due on 3 Nov 2026.',
      ],
      [
        'style-payment-received',
        'Tom',
        'Thank you for your payment of USD 860.50, received on 9 Oct 2026.',
      ],
      [
        'style-campaign-launch',
        'Ana',
        'Your campaign launches on 16 Nov 2026 with a budget of USD 3,500.00 a month.',
      ],
      [
        'style-meeting-confirmation',
        'Marcus',
        'We will review the proposal together on 5 Nov 2026.',
      ],
      [
        'style-price-change',
        'Dana',
        'From 1 Dec 2026 your retainer changes to USD 4,410.00 a month.',
      ],
      ['style-ad-pause', 'Elena', 'All your ads will pause on 1 Aug 2027, as you asked.'],
      ['style-refund', 'Sam', 'Your refund of USD 275.00 was processed on 20 Oct 2026.'],
      [
        'style-overspend',
        'Jo',
        'Ad spend reached USD 3,612.40 on 28 Oct 2026, above your monthly cap.',
      ],
    ].map(([key = '', name = '', body = '']) => [
      key,
      `Subject: [Lakeshore] Update\n\nHi ${name},\n\n${body}\n\n— The Lakeshore team`,
    ]),
  ),
};

const SUITES = [
  SERVICE_CATALOG_SUITE,
  HOUSE_STYLE_SUITE,
  CLIENT_MEMORY_SUITE,
  FILE_READING_SUITE,
].map((suite) => suiteInputSchema.parse(suite));
const TASKS = SUITES.flatMap((suite) => suite.tasks);

const score = async (task: (typeof TASKS)[number], output: string): Promise<number> =>
  (
    await scoreTask(
      task.scorers,
      { taskPrompt: task.prompt, finalOutput: output, readFile: () => null, toolCalls: [] },
      task.passThreshold,
    )
  ).score;

describe('Capability suites', () => {
  it('are valid, with eight tasks each and a reference reply for every task', () => {
    expect(SUITES.map((suite) => suite.tasks.length)).toEqual([8, 8, 8, 8]);
    expect(Object.keys(REFERENCE).toSorted()).toEqual(TASKS.map((task) => task.key).toSorted());
    expect(skillInputSchema.safeParse(SERVICE_CATALOG_SKILL).success).toBe(true);
    expect(skillInputSchema.safeParse(HOUSE_STYLE_SKILL).success).toBe(true);
    for (const config of CAPABILITY_CONFIGS({ catalog: 'catalog-id', emailStyle: 'style-id' })) {
      expect(agentConfigInputSchema.safeParse(config).success).toBe(true);
    }
  });

  it.each(TASKS.map((task) => [task.key, task] as const))(
    '%s scores 1 with the capability and 0 without it',
    async (key, task) => {
      expect(await score(task, REFERENCE[key] ?? '')).toBe(1);
      // Without the capability: no answer, or for emails, a typical reply in no particular style.
      const without = key.startsWith('style-')
        ? 'Subject: Update\n\nDear client,\n\nPlease note the details below!\n\nBest regards,\nAccount team'
        : "I don't have that information.";
      expect(await score(task, without)).toBe(0);
    },
  );

  it('keeps every catalog answer in the skill and every client fact in memory', () => {
    for (const fact of ['LSD-PPC-330', 'Ravi Menon', '8 business hours', '12%', 'instead of']) {
      expect(SERVICE_CATALOG_SKILL.content).toContain(fact);
    }
    const memory = CLIENT_MEMORY_ENTRIES.join('\n');
    for (const fact of [
      'Priya Raman',
      'Notion',
      '$4,200',
      'August',
      'Marcus Bell',
      '#2E7D32',
      'April 1',
    ]) {
      expect(memory).toContain(fact);
    }
  });

  it('differs from its baseline in exactly one setting', () => {
    const [baseline, skill, memory, emailStyle] = CAPABILITY_CONFIGS({
      catalog: 'catalog-id',
      emailStyle: 'style-id',
    }).map((config) => {
      const {
        name: _name,
        description: _description,
        ...settings
      } = agentConfigInputSchema.parse(config);
      return settings;
    });
    expect({ ...skill, skillIds: [] }).toEqual(baseline);
    expect({ ...memory, memory: { mode: 'disabled' } }).toEqual(baseline);
    expect({ ...emailStyle, skillIds: [] }).toEqual(baseline);
  });
});
