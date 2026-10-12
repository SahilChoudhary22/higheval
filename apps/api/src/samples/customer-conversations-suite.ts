import type { SuiteInput } from '@higheval/shared';

/**
 * Pinned judge for the conversational sample suite. A different model family
 * from the sample configurations under test (both NVIDIA Nemotron), so the
 * judge never grades its own family's output; launch also refuses an exact
 * match. Free-tier and fast (~9 s per verdict in screening).
 */
export const SAMPLE_JUDGE = {
  provider: 'openrouter' as const,
  model: 'cohere/north-mini-code:free',
};

const finalOutput = { kind: 'final_output' as const };

/**
 * Sample suite for conversational quality: synthetic customer messages where
 * hard requirements are checked deterministically (cheap, stable, explainable)
 * and the quality of the reply is rated by a pinned LLM judge against a rubric.
 */
export const CUSTOMER_CONVERSATIONS_SUITE: SuiteInput = {
  name: 'Customer conversations',
  description:
    'Three synthetic customer messages (a late refund, a pricing question, an SMS reschedule). Hard requirements are deterministic checks; tone, accuracy and helpfulness are rated by a pinned LLM judge.',
  tasks: [
    {
      key: 'late-refund-reply',
      title: 'Reply to a late-refund complaint',
      tags: ['support', 'policy', 'judge'],
      passThreshold: 0.8,
      prompt: [
        "You are a support agent on Harbor Fitness's billing team.",
        "Policy: approved refunds reach the customer's card within 5–7 business days of approval. Never promise a specific date. If a refund has not arrived after 7 business days, offer to escalate to the billing lead.",
        'Customer message: "It\'s been 6 business days since you approved my $180 refund and I still don\'t have it. This is ridiculous."',
        'Write the reply you would send, and nothing else.',
      ].join('\n'),
      scorers: [
        {
          type: 'regex',
          target: finalOutput,
          pattern: '5\\s*(?:–|-|to)\\s*7\\s+business\\s+days',
          flags: 'i',
          label: 'States the 5–7 business day window',
          required: true,
        },
        {
          type: 'regex',
          target: finalOutput,
          pattern:
            '^(?![\\s\\S]*\\b(?:tomorrow|today|guarantee[ds]?|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\\b)',
          flags: 'i',
          label: 'Promises no specific date',
          required: true,
        },
        {
          type: 'llm_judge',
          target: finalOutput,
          judge: SAMPLE_JUDGE,
          weight: 2,
          rubric:
            'Refund policy: approved refunds arrive within 5–7 business days of approval; never promise a specific date; after 7 business days, offer escalation to the billing lead. The customer is 6 business days in, so the refund is still within the window.',
          criteria: [
            {
              key: 'empathy',
              description:
                "Acknowledges the customer's frustration sincerely, without being defensive",
            },
            {
              key: 'policy-accuracy',
              description:
                'Explains the 5–7 business day window correctly and promises no exact date',
            },
            {
              key: 'next-step',
              description:
                'Gives a concrete next step (e.g. escalation if it has not arrived after day 7)',
            },
            { key: 'concise', description: 'Clear and to the point; no filler or repetition' },
          ],
        },
      ],
    },
    {
      key: 'pricing-inquiry-reply',
      title: 'Answer a pricing question without quoting prices',
      tags: ['sales', 'policy', 'judge'],
      passThreshold: 0.8,
      prompt: [
        'You reply to inbound leads for a marketing agency.',
        'Pricing is custom and is only discussed on a free 20-minute discovery call. Never quote prices or price ranges. Booking link: https://example.com/book',
        'Lead message: "Hi, how much is your Google Ads management? Just need a ballpark."',
        'Reply in 2–4 sentences, and nothing else.',
      ].join('\n'),
      scorers: [
        {
          type: 'contains',
          target: finalOutput,
          value: 'https://example.com/book',
          label: 'Includes the booking link',
          required: true,
        },
        {
          type: 'regex',
          target: finalOutput,
          pattern: '^(?![\\s\\S]*(?:[$€£]\\s*\\d|\\d[\\d,.]*\\s*(?:usd|dollars|per month|/mo)))',
          flags: 'i',
          label: 'Quotes no prices',
          required: true,
        },
        {
          type: 'llm_judge',
          target: finalOutput,
          judge: SAMPLE_JUDGE,
          weight: 2,
          rubric:
            'Agency policy: pricing is custom and only discussed on a free 20-minute discovery call; never quote prices or ranges; the booking link is https://example.com/book. A good reply respects the question, explains briefly why there is no ballpark, and makes booking easy.',
          criteria: [
            {
              key: 'helpfulness',
              description:
                'Takes the question seriously and explains why pricing depends on a call',
            },
            {
              key: 'no-invented-facts',
              description: 'States no prices, ranges, guarantees or details beyond the policy',
            },
            {
              key: 'call-to-action',
              description: 'Clearly invites the lead to book using the link',
            },
            { key: 'tone', description: 'Friendly and professional, not pushy' },
          ],
        },
      ],
    },
    {
      key: 'sms-reschedule-reply',
      title: 'Reschedule by SMS within 160 characters',
      tags: ['scheduling', 'sms', 'judge'],
      passThreshold: 0.8,
      prompt: [
        'Reply by SMS on behalf of Lumen Spa.',
        'The customer wrote: "Can\'t make tomorrow 3pm, can we do Thursday instead?"',
        'Thursday openings: 10:00 and 14:30.',
        'The reply must be a single SMS of at most 160 characters, offer both Thursday times, and ask the customer to confirm one. Reply with the SMS text only.',
      ].join('\n'),
      scorers: [
        {
          type: 'regex',
          target: finalOutput,
          pattern: '^\\s*[^\\n]{1,160}\\s*$',
          label: 'Single SMS of at most 160 characters',
          required: true,
        },
        {
          type: 'regex',
          target: finalOutput,
          pattern: '\\b10(?::00)?\\s*(?:am|a\\.m\\.)?\\b',
          flags: 'i',
          label: 'Offers 10:00',
          required: true,
        },
        {
          type: 'regex',
          target: finalOutput,
          pattern: '(?:14:30|2:30)',
          label: 'Offers 14:30',
          required: true,
        },
        {
          type: 'llm_judge',
          target: finalOutput,
          judge: SAMPLE_JUDGE,
          weight: 2,
          rubric:
            'The customer cannot make tomorrow at 3pm and asked for Thursday. Thursday openings are 10:00 and 14:30. A good SMS is warm, offers both times and asks the customer to confirm one, in one short message.',
          criteria: [
            { key: 'tone', description: 'Warm and polite, appropriate for a spa' },
            {
              key: 'actionable',
              description: 'Easy to answer: offers both times and asks for a confirmation',
            },
          ],
        },
      ],
    },
  ],
};
