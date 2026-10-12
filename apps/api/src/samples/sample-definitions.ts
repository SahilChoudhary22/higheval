import type { AgentConfigInput, SkillInput } from '@higheval/shared';

/** A reusable skill demonstrating how skills change agent behaviour. */
export const DATA_TASK_CHECKLIST_SKILL: SkillInput = {
  name: 'data-task-checklist',
  description:
    'Checklist for back-office data tasks: read rules literally, compute carefully, verify outputs.',
  content: [
    '# Data task checklist',
    '',
    'Use this whenever a task asks you to process a data file and produce a structured result.',
    '',
    '1. Restate each rule from the task in your own words before computing. Note strict vs inclusive boundaries (`<` vs `<=`, "before" vs "on or before").',
    '2. Read the whole input file. Normalize values before comparing (trim whitespace, lower-case emails, strip non-digits from phone numbers, convert times to the stated time zone).',
    '3. Compute row by row and keep a short working list; do not estimate.',
    '4. Write the output file with exactly the keys requested, valid JSON, numbers as numbers (not strings), and lists sorted as instructed.',
    '5. Re-open the file you wrote and check it against every rule once more before replying.',
  ].join('\n'),
};

export const SAMPLE_MODELS = {
  baseline: 'nvidia/nemotron-3-super-120b-a12b:free',
  candidate: 'nvidia/nemotron-3.5-lightning:free',
} as const;

const shared = { toolsets: ['file' as const], maxTurns: 12, timeoutSeconds: 240 };

export const SAMPLE_CONFIGS: AgentConfigInput[] = [
  {
    name: 'Nemotron 3 Super · file tools',
    description: 'Baseline: established 120B open model, file tools only, no skills, memory off.',
    model: { provider: 'openrouter', model: SAMPLE_MODELS.baseline },
    ...shared,
  },
  {
    name: 'Nemotron 3.5 Lightning · file tools',
    description: 'Candidate: newer, faster model. Everything else identical to the baseline.',
    model: { provider: 'openrouter', model: SAMPLE_MODELS.candidate },
    ...shared,
  },
];

/** Same as the candidate, plus the checklist skill: for skill on/off experiments. */
export const SAMPLE_SKILL_CONFIG = (skillId: string): AgentConfigInput => ({
  name: 'Nemotron 3.5 Lightning · file tools + checklist skill',
  description: 'Candidate model with the data-task-checklist skill preloaded.',
  model: { provider: 'openrouter', model: SAMPLE_MODELS.candidate },
  skillIds: [skillId],
  ...shared,
});
