import type { SkillInput } from '@higheval/shared';
import { SAMPLE_JUDGE } from '../samples/customer-conversations-suite.js';

/**
 * Guidance preloaded into the drafting agent as a Hermes skill. The JSON
 * Schema in its workspace covers structure; this covers what the schema
 * cannot: what each scorer means and what makes a task a fair test.
 */
export const SUITE_AUTHORING_SKILL: SkillInput = {
  name: 'suite-authoring',
  description:
    'How to write a HighEval task suite: fair tasks, fixtures and deterministic scorers.',
  content: `# Writing a HighEval suite

A suite is a set of tasks. Each task gives an agent a prompt and some fixture
files in its working directory, and scorers check what the agent produced.
Two agent configurations run the same suite, and their scores are compared.

## What makes a good task
- **One correct answer.** If two careful people could disagree on the answer,
  rewrite the task until they could not.
- **Realistic and specific.** Small, believable business data (5–15 rows) with
  deliberate edge cases: boundary dates, ties, missing values, time zones,
  partial payments, tiered thresholds. Edge cases are what separate agents.
- **Say exactly what to produce.** Name the output file, its JSON shape and key
  names, units, rounding and sort order. Ambiguity measures luck, not skill.
- **Never put the answer in a fixture.** Fixtures hold inputs only; expected
  values live only in scorers.
- **Keep fixture data consistent.** No row may contradict itself (e.g. a
  status of "missed" next to a timely cancellation); every edge case should
  have exactly one defensible reading.
- **Compute expected values with a script**, not in your head. Write the
  fixture data to a file and calculate every expected number, list and date
  with Python in the terminal, then copy the results into the scorers.
- Keys are lowercase-with-hyphens and unique. Titles are short.

## Scorers
Each scorer has a \`weight\` (default 1) and optional \`required: true\` (if it
fails, the task fails whatever else passed). A task passes when its weighted
score reaches \`passThreshold\` (default 1, i.e. every scorer must pass).

Targets: \`{"kind": "final_output"}\` (the agent's final reply) or
\`{"kind": "file", "path": "out.json"}\` (a file the agent wrote).

- \`file_exists\` — \`path\` was created.
- \`json_field\` — the value at \`path\` (dot/bracket syntax, e.g.
  \`items[0].total\`; empty string for the whole document) equals \`expected\`.
  Options: \`tolerance\` (absolute, for numbers), \`unordered\` (arrays in any
  order), \`exact\` (objects must not have extra keys). For a reply, the last
  JSON value in the text is used.
- \`json_valid\` — the target parses as JSON.
- \`contains\` — the target includes \`value\` (\`caseSensitive\` defaults to false).
- \`regex\` — the target matches \`pattern\` (JavaScript syntax; \`flags\` from
  i, m, s, u). Do not nest repeats like \`(a+)+\`.
- \`tool_called\` — the agent used \`tool\` between \`min\` and \`max\` times.
- \`llm_judge\` — only for qualities a rule cannot check (tone, helpfulness).
  Use \`"judge": ${JSON.stringify(SAMPLE_JUDGE)}\`, a \`rubric\` with the policy
  or context the judge needs, and 1–4 \`criteria\` (\`key\`, \`description\`).
  Pair it with deterministic \`required\` scorers for any hard rule.

If the prompt does not fix the order of a list, set \`unordered: true\` on its
\`json_field\` scorer; better still, tell the agent how to sort it.

Prefer one \`file_exists\` plus one \`json_field\` per expected value, so partial
answers earn partial credit and every failure has a clear reason.

## Reference solutions
For every task, also write what a perfect agent would leave behind: the
files it would write and its final reply. HighEval runs your deterministic
scorers against this reference, and every one must pass. If one fails, either
the scorer or the reference is wrong; fix whichever it is.
`,
};
