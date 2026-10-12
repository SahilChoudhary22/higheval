import type { ScorerSpecInput, SkillInput, SuiteInput } from '@higheval/shared';

/**
 * Capability demos: three small suites, each answerable only with one
 * configuration setting, so switching that setting on or off produces a
 * clear, explainable difference. Every fact is invented, so a model cannot
 * answer from its training data.
 */

const reply = (path: string, expected: number | string, tolerance?: number): ScorerSpecInput => ({
  type: 'json_field',
  target: { kind: 'final_output' },
  path,
  expected,
  ...(tolerance === undefined ? {} : { tolerance }),
});
const says = (value: string): ScorerSpecInput => ({
  type: 'contains',
  target: { kind: 'final_output' },
  value,
});

// --- Skill: knowledge only the skill provides --------------------------------

export const SERVICE_CATALOG_SKILL: SkillInput = {
  name: 'lakeshore-service-catalog',
  description:
    "Lakeshore Digital's service codes, prices, discount rules, support SLAs and escalation contacts.",
  content: [
    '# Lakeshore Digital service catalog',
    '',
    "Use this whenever a question involves Lakeshore Digital's services, billing codes, prices, discounts, support targets or escalations.",
    '',
    '## Services (monthly list price, USD)',
    '',
    '| Code | Service | Price |',
    '| --- | --- | ---: |',
    '| LSD-SEO-210 | Local SEO | 640 |',
    '| LSD-PPC-330 | Google Ads management | 890 |',
    '| LSD-SOC-115 | Social media management | 520 |',
    '| LSD-WEB-404 | Website care plan | 310 |',
    '| LSD-REP-150 | Review management | 275 |',
    '| LSD-EML-260 | Email marketing | 430 |',
    '',
    '## Discounts',
    '',
    '1. **Bundle:** 3 or more services take 12% off their combined list price.',
    '2. **Annual prepay:** a further 5% off, applied after the bundle discount (or to list price if there is no bundle).',
    '3. **Non-profit:** 20% off list price *instead of* the bundle and prepay discounts. Charge whichever of the two outcomes is cheaper for the client.',
    '',
    'Quote monthly prices in whole dollars, rounding halves up.',
    '',
    '## Support first-response targets by plan',
    '',
    '- Starter: 2 business days',
    '- Growth: 8 business hours',
    '- Scale: 1 business hour',
    '',
    '## Escalations',
    '',
    '- Billing disputes: Dana Ortiz (Finance)',
    '- Suspended ad accounts: Ravi Menon (Paid media lead)',
    '- Website outages: the on-call engineer, via #web-oncall',
    '- Anything legal: Grace Liu (Account director)',
  ].join('\n'),
};

const ASK = 'You are an account coordinator at Lakeshore Digital, a marketing agency.';

export const SERVICE_CATALOG_SUITE: SuiteInput = {
  name: 'Capability: service catalog',
  description:
    "Questions that need Lakeshore Digital's internal catalog and pricing rules. Only the lakeshore-service-catalog skill provides them, so it shows what a skill adds.",
  tasks: [
    {
      key: 'catalog-service-code',
      title: 'Service code',
      prompt: `${ASK} What is our billing code for Google Ads management? Reply with only JSON: {"code": "<code>"}`,
      scorers: [reply('code', 'LSD-PPC-330')],
    },
    {
      key: 'catalog-bundle-price',
      title: 'Bundle price',
      prompt: `${ASK} A client wants Local SEO, Social media management and Email marketing, billed monthly. They are not a non-profit. What is their monthly price? Reply with only JSON: {"monthly_price": <whole dollars>}`,
      scorers: [reply('monthly_price', 1399)],
    },
    {
      key: 'catalog-bundle-prepay',
      title: 'Bundle with annual prepay',
      prompt: `${ASK} A client wants Google Ads management, the Website care plan and Review management, and prepays annually. They are not a non-profit. What is their monthly price? Reply with only JSON: {"monthly_price": <whole dollars>}`,
      scorers: [reply('monthly_price', 1233)],
    },
    {
      key: 'catalog-prepay-rounding',
      title: 'Prepay without a bundle',
      prompt: `${ASK} A client wants Social media management and the Website care plan, and prepays annually. They are not a non-profit. What is their monthly price? Reply with only JSON: {"monthly_price": <whole dollars>}`,
      scorers: [reply('monthly_price', 789)],
    },
    {
      key: 'catalog-nonprofit-small',
      title: 'Non-profit, two services',
      prompt: `${ASK} A non-profit client wants Local SEO and Google Ads management, billed monthly. What is their monthly price? Reply with only JSON: {"monthly_price": <whole dollars>}`,
      scorers: [reply('monthly_price', 1224)],
    },
    {
      key: 'catalog-nonprofit-best-deal',
      title: 'Non-profit versus bundle',
      prompt: `${ASK} A non-profit client wants Local SEO, Google Ads management, Social media management and Email marketing, and prepays annually. What is their monthly price? Reply with only JSON: {"monthly_price": <whole dollars>}`,
      scorers: [reply('monthly_price', 1984)],
    },
    {
      key: 'catalog-support-target',
      title: 'Support target',
      prompt: `${ASK} A client on the Growth plan just emailed support. What is our first-response target for them? Reply in one sentence.`,
      scorers: [
        {
          type: 'regex',
          target: { kind: 'final_output' },
          pattern: '\\b8 business hours\\b',
          flags: 'i',
        },
      ],
    },
    {
      key: 'catalog-escalation',
      title: 'Escalation contact',
      prompt: `${ASK} A client's Google Ads account has just been suspended. Who do we escalate this to? Reply in one sentence with the person's name.`,
      scorers: [says('Ravi Menon')],
    },
  ],
};

// --- Memory: facts only the seeded memory provides --------------------------

export const CLIENT_MEMORY_ENTRIES: string[] = [
  "Brightline Dental's account manager is Priya Raman.",
  'Harbor Fitness wants monthly reports as a shared Notion page, never as email attachments.',
  "Cedar Law Group's monthly retainer is $4,200, billed on the 15th of each month.",
  'Lumen Spa pauses all advertising every August.',
  "Oakridge Realty's main contact is Marcus Bell. Call him before 10am; he ignores email.",
  "Summit Roofing's Google Ads budget is capped at $3,500 per month.",
  "Pinecrest Vet's brand colour is #2E7D32; their logo must never be recoloured.",
  "Our agency's fiscal year starts on April 1.",
];

const RECALL = 'You are an account coordinator at a marketing agency.';

export const CLIENT_MEMORY_SUITE: SuiteInput = {
  name: 'Capability: client memory',
  description:
    'Questions about clients that only the seeded memory answers, so it shows what memory adds.',
  tasks: [
    {
      key: 'memory-account-manager',
      title: 'Account manager',
      prompt: `${RECALL} Who is Brightline Dental's account manager? Reply with only JSON: {"account_manager": "<full name>"}`,
      scorers: [reply('account_manager', 'Priya Raman')],
    },
    {
      key: 'memory-report-format',
      title: 'Report delivery',
      prompt: `${RECALL} How does Harbor Fitness want its monthly reports delivered? Reply in one sentence.`,
      scorers: [says('Notion')],
    },
    {
      key: 'memory-retainer',
      title: 'Retainer terms',
      prompt: `${RECALL} What is Cedar Law Group's monthly retainer, and on which day of the month is it billed? Reply with only JSON: {"retainer": <dollars>, "billing_day": <day of month>}`,
      scorers: [reply('retainer', 4200), reply('billing_day', 15)],
    },
    {
      key: 'memory-ad-pause',
      title: 'Advertising pause',
      prompt: `${RECALL} In which month should we not schedule any Lumen Spa ads? Reply in one sentence.`,
      scorers: [says('August')],
    },
    {
      key: 'memory-contact',
      title: 'Client contact',
      prompt: `${RECALL} Who should we contact at Oakridge Realty about a new proposal, and how? Reply in one or two sentences.`,
      scorers: [
        says('Marcus Bell'),
        { type: 'regex', target: { kind: 'final_output' }, pattern: '\\b(call|phone)', flags: 'i' },
      ],
    },
    {
      key: 'memory-budget-cap',
      title: 'Budget cap',
      prompt: `${RECALL} What is Summit Roofing's monthly Google Ads budget cap? Reply with only JSON: {"monthly_cap": <dollars>}`,
      scorers: [reply('monthly_cap', 3500)],
    },
    {
      key: 'memory-brand-colour',
      title: 'Brand colour',
      prompt: `${RECALL} What is Pinecrest Vet's brand colour, as a hex code? Reply in one sentence.`,
      scorers: [says('#2E7D32')],
    },
    {
      key: 'memory-fiscal-quarter',
      title: 'Fiscal quarter',
      prompt: `${RECALL} Which quarter of our agency's fiscal year does 2026-11-15 fall in? Reply with only JSON: {"fiscal_quarter": <1-4>}`,
      scorers: [reply('fiscal_quarter', 3)],
    },
  ],
};

// --- Tools: answers that are only in the workspace files ---------------------

const READ = 'Answer from the files in your working directory.';

export const FILE_READING_SUITE: SuiteInput = {
  name: 'Capability: reading files',
  description:
    "Questions whose answers are only in the task's files, so it shows what file tools add (or what removing them costs).",
  tasks: [
    {
      key: 'files-unpaid-invoices',
      title: 'Unpaid invoices',
      prompt: `${READ} How many invoices in invoices.csv are unpaid, and what is their total amount? Reply with only JSON: {"unpaid_count": <n>, "unpaid_total": <amount>}`,
      fixtures: [
        {
          path: 'invoices.csv',
          content:
            'invoice_id,client,amount,status\nINV-501,Brightline Dental,1240.00,paid\nINV-502,Harbor Fitness,860.50,unpaid\nINV-503,Cedar Law Group,4200.00,unpaid\nINV-504,Lumen Spa,375.25,paid\nINV-505,Summit Roofing,1980.00,unpaid\nINV-506,Pinecrest Vet,640.00,paid\n',
        },
      ],
      scorers: [reply('unpaid_count', 3), reply('unpaid_total', 7040.5, 0.01)],
    },
    {
      key: 'files-largest-active-campaign',
      title: 'Largest active campaign',
      prompt: `${READ} Which active campaign in campaigns.json has the largest budget? Reply with only JSON: {"campaign": "<name>"}`,
      fixtures: [
        {
          path: 'campaigns.json',
          content: JSON.stringify(
            {
              campaigns: [
                { name: 'Spring Promo', budget: 2500, status: 'active' },
                { name: 'Summer Sale', budget: 4100, status: 'paused' },
                { name: 'Back to School', budget: 3300, status: 'active' },
                { name: 'Holiday Push', budget: 5200, status: 'draft' },
              ],
            },
            null,
            2,
          ),
        },
      ],
      scorers: [reply('campaign', 'Back to School')],
    },
    {
      key: 'files-contact-email',
      title: 'Contact email',
      prompt: `${READ} What is the email address of our contact at Oakridge Realty, according to contacts.csv? Reply with only JSON: {"email": "<address>"}`,
      fixtures: [
        {
          path: 'contacts.csv',
          content:
            'name,company,email\nPriya Raman,Brightline Dental,priya@brightline.example\nMarcus Bell,Oakridge Realty,m.bell@oakridge-realty.example\nDana Ortiz,Cedar Law Group,dortiz@cedarlaw.example\n',
        },
      ],
      scorers: [reply('email', 'm.bell@oakridge-realty.example')],
    },
    {
      key: 'files-reorder',
      title: 'Items to reorder',
      prompt: `${READ} Which SKUs in inventory.csv are at or below their reorder point? Reply with only JSON: {"skus": ["<sku>", ...]} sorted alphabetically.`,
      fixtures: [
        {
          path: 'inventory.csv',
          content:
            'sku,on_hand,reorder_point\nSKU-A,40,50\nSKU-B,120,60\nSKU-C,15,15\nSKU-D,9,30\nSKU-E,75,70\n',
        },
      ],
      scorers: [
        {
          type: 'json_field',
          target: { kind: 'final_output' },
          path: 'skus',
          expected: ['SKU-A', 'SKU-C', 'SKU-D'],
          unordered: true,
        },
      ],
    },
    {
      key: 'files-meeting-date',
      title: 'Agreed review date',
      prompt: `${READ} According to meeting-notes.md, on what date did we agree to review the proposal? Reply with only JSON: {"review_date": "YYYY-MM-DD"}`,
      fixtures: [
        {
          path: 'meeting-notes.md',
          content:
            '# Kickoff with Harbor Fitness\n\n- Attendees: Priya, Marcus, the Harbor ops team.\n- Harbor wants to relaunch the referral programme before the holidays.\n- We agreed to review the proposal on Thursday 2026-11-05, after their board meeting.\n- Next check-in: two weeks later.\n',
        },
      ],
      scorers: [reply('review_date', '2026-11-05')],
    },
    {
      key: 'files-error-count',
      title: 'Errors in a log',
      prompt: `${READ} How many ERROR lines are in app.log? Reply with only JSON: {"errors": <n>}`,
      fixtures: [
        {
          path: 'app.log',
          content:
            '09:00:01 INFO  sync started\n09:00:04 ERROR timeout contacting crm\n09:01:10 WARN  retrying crm\n09:01:12 ERROR timeout contacting crm\n09:02:00 INFO  sync resumed\n09:05:33 ERROR invalid phone for contact C-114\n09:06:00 INFO  sync finished\n09:07:45 ERROR report upload failed\n',
        },
      ],
      scorers: [reply('errors', 4)],
    },
    {
      key: 'files-digest-setting',
      title: 'Configured setting',
      prompt: `${READ} What is the email digest setting in settings.json (notifications → email → digest)? Reply with only JSON: {"digest": "<value>"}`,
      fixtures: [
        {
          path: 'settings.json',
          content: JSON.stringify(
            {
              notifications: {
                email: { digest: 'biweekly-tue', enabled: true },
                sms: { enabled: false },
              },
            },
            null,
            2,
          ),
        },
      ],
      scorers: [reply('digest', 'biweekly-tue')],
    },
    {
      key: 'files-average-rating',
      title: 'Average rating',
      prompt: `${READ} What is the average rating in survey.csv, rounded to two decimal places? Reply with only JSON: {"average": <number>}`,
      fixtures: [
        {
          path: 'survey.csv',
          content: 'respondent,rating\nR1,9\nR2,7\nR3,10\nR4,6\nR5,8\nR6,9\nR7,4\nR8,10\n',
        },
      ],
      scorers: [reply('average', 7.88, 0.005)],
    },
  ],
};

// --- Skill (procedure): how to write, not what to know ----------------------

export const HOUSE_STYLE_SKILL: SkillInput = {
  name: 'lakeshore-email-style',
  description:
    'How Lakeshore Digital writes client emails: subject, greeting, dates, money and sign-off.',
  content: [
    '# Lakeshore Digital email house style',
    '',
    'Follow this for every email to a client.',
    '',
    '1. First line: `Subject: [Lakeshore] <topic>`.',
    '2. Greeting on its own line: `Hi <first name>,` (first name only).',
    '3. Dates as day, three-letter month, year, with no leading zero: `3 Nov 2026`.',
    '4. Money as `USD` followed by the amount with thousands separators and two decimals: `USD 1,240.00`.',
    '5. Never use exclamation marks.',
    '6. Sign off on the last line with exactly: `— The Lakeshore team`',
  ].join('\n'),
};

const line = (pattern: string): ScorerSpecInput => ({
  type: 'regex',
  target: { kind: 'final_output' },
  pattern,
  flags: 'm',
});
/** The house-style checks every email gets, plus the facts specific to the task. */
const houseStyle = (firstName: string, facts: string[]): ScorerSpecInput[] => [
  { ...line('^Subject: \\[Lakeshore\\] \\S'), label: 'Subject line' },
  { ...line(`^Hi ${firstName},$`), label: 'Greeting' },
  ...facts.map((fact) => ({
    ...line(fact.replaceAll('.', '\\.')),
    label: `Writes ${fact}`,
  })),
  { ...line('^[—–-] The Lakeshore team$'), label: 'Sign-off' },
  {
    type: 'regex',
    target: { kind: 'final_output' },
    pattern: '^[^!]*$',
    label: 'No exclamation marks',
  },
];

const WRITE =
  'You are an account coordinator at Lakeshore Digital, a marketing agency. Write the email described below. Reply with only the email.';

export const HOUSE_STYLE_SUITE: SuiteInput = {
  name: 'Capability: email house style',
  description:
    "Client emails checked against Lakeshore Digital's house style, which only the lakeshore-email-style skill describes: a skill that teaches a procedure rather than facts.",
  tasks: [
    {
      key: 'style-invoice-reminder',
      title: 'Invoice reminder',
      prompt: `${WRITE}\n\nTo Priya Raman at Brightline Dental: a friendly reminder that invoice INV-2042 for $1240 is due on 2026-11-03.`,
      scorers: houseStyle('Priya', ['USD 1,240.00', '3 Nov 2026']),
    },
    {
      key: 'style-payment-received',
      title: 'Payment received',
      prompt: `${WRITE}\n\nTo Tom Reyes at Harbor Fitness: thank them for their payment of $860.5, received on 2026-10-09.`,
      scorers: houseStyle('Tom', ['USD 860.50', '9 Oct 2026']),
    },
    {
      key: 'style-campaign-launch',
      title: 'Campaign launch',
      prompt: `${WRITE}\n\nTo Ana Cruz at Summit Roofing: their new Google Ads campaign launches on 2026-11-16 with a monthly budget of $3500.`,
      scorers: houseStyle('Ana', ['USD 3,500.00', '16 Nov 2026']),
    },
    {
      key: 'style-meeting-confirmation',
      title: 'Meeting confirmation',
      prompt: `${WRITE}\n\nTo Marcus Bell at Oakridge Realty: confirm that we will review the proposal together on 2026-11-05.`,
      scorers: houseStyle('Marcus', ['5 Nov 2026']),
    },
    {
      key: 'style-price-change',
      title: 'Retainer change',
      prompt: `${WRITE}\n\nTo Dana Ortiz at Cedar Law Group: their monthly retainer changes from $4200 to $4410 starting 2026-12-01.`,
      scorers: houseStyle('Dana', ['USD 4,410.00', '1 Dec 2026']),
    },
    {
      key: 'style-ad-pause',
      title: 'Advertising pause',
      prompt: `${WRITE}\n\nTo Elena Park at Lumen Spa: confirm that all their ads will pause on 2027-08-01, as they asked.`,
      scorers: houseStyle('Elena', ['1 Aug 2027']),
    },
    {
      key: 'style-refund',
      title: 'Refund processed',
      prompt: `${WRITE}\n\nTo Sam Lee at Pinecrest Vet: their refund of $275 was processed on 2026-10-20.`,
      scorers: houseStyle('Sam', ['USD 275.00', '20 Oct 2026']),
    },
    {
      key: 'style-overspend',
      title: 'Budget alert',
      prompt: `${WRITE}\n\nTo Jo Kim at Bayview Bakery: ad spend reached $3612.4 on 2026-10-28, above their monthly cap.`,
      scorers: houseStyle('Jo', ['USD 3,612.40', '28 Oct 2026']),
    },
  ],
};

// --- Persona: who the agent is (SOUL.md), not what it knows -----------------

export const QUILL_SOUL = [
  '# Quill',
  '',
  'You are Quill, the client coordinator at Lakeshore Digital, a small marketing agency. You are warm, calm and brief.',
  '',
  'How you write to clients:',
  '- Start every reply with "Hi <first name>," on its own line.',
  '- Never use exclamation marks; calm reassurance works better.',
  '- Never quote prices, discounts or dates you cannot guarantee. When a client is unhappy, or asks about money or deadlines, offer a call with their account team.',
  '- End every reply with the line "— Quill, Lakeshore Digital".',
].join('\n');

/** The persona's four habits, checked on every reply. */
const personaChecks = (firstName: string): ScorerSpecInput[] => [
  { ...line(`^Hi ${firstName},$`), label: 'Greets by first name' },
  {
    type: 'regex',
    target: { kind: 'final_output' },
    pattern: '^[^!]*$',
    label: 'No exclamation marks',
  },
  {
    type: 'contains',
    target: { kind: 'final_output' },
    value: 'account team',
    label: 'Offers a call with the account team',
  },
  { ...line('^[—–-] Quill, Lakeshore Digital$'), label: 'Signs as Quill' },
];

const REPLY = 'Reply to this message from a client. Reply with only your message.';

const client = (key: string, title: string, from: string, company: string, message: string) => ({
  key,
  title,
  prompt: `${REPLY}\n\nFrom: ${from} (${company})\n\n${message}`,
  scorers: personaChecks(from.split(' ')[0] ?? from),
});

export const PERSONA_SUITE: SuiteInput = {
  name: 'Capability: persona',
  description:
    'Replies to clients that should sound like Quill, the coordinator described in a SOUL.md: how it greets, its calm tone, what it never promises and how it signs off.',
  tasks: [
    client(
      'persona-ads-down',
      'Ads stopped showing',
      'Priya Raman',
      'Brightline Dental',
      "Our ads stopped showing yesterday and we're losing bookings. What's going on?",
    ),
    client(
      'persona-discount',
      'Discount request',
      'Tom Reyes',
      'Harbor Fitness',
      'Can you give us a discount if we sign up for a full year?',
    ),
    client(
      'persona-launch-date',
      'Launch date',
      'Ana Cruz',
      'Summit Roofing',
      'When exactly will the new website go live? We need a date for our launch event.',
    ),
    client(
      'persona-late-report',
      'Late report',
      'Marcus Bell',
      'Oakridge Realty',
      "This month's report is late again. Honestly, I'm frustrated.",
    ),
    client(
      'persona-add-service',
      'Adding a service',
      'Dana Ortiz',
      'Cedar Law Group',
      'How much would it cost to add email marketing to our plan?',
    ),
    client(
      'persona-double-charge',
      'Charged twice',
      'Elena Park',
      'Lumen Spa',
      'We were charged twice this month. Please fix this.',
    ),
    client(
      'persona-guarantee',
      'Ranking guarantee',
      'Sam Lee',
      'Pinecrest Vet',
      "Can you guarantee we'll be on Google's first page by December?",
    ),
    client(
      'persona-engagement',
      'Low engagement',
      'Jo Kim',
      'Bayview Bakery',
      'Our social posts got zero engagement this week. Is it worth continuing?',
    ),
  ],
};
