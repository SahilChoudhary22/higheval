import type { Comparison, Experiment, RunSummary, Verdict } from '@higheval/shared';

const VERDICT_TEXT: Record<Verdict, string> = {
  candidate_better: 'Candidate is better',
  candidate_worse: 'Candidate is worse',
  practically_equivalent: 'Practically equivalent',
  inconclusive: 'Inconclusive',
  insufficient_data: 'Not enough data',
};

const MINUS = '−';
const signed = (value: number | null, digits = 3): string => {
  if (value === null) return '—';
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return fixed;
  return `${value > 0 ? '+' : MINUS}${fixed}`;
};
const score = (value: number | null): string => (value === null ? '—' : value.toFixed(3));
const percent = (value: number | null): string =>
  value === null ? '—' : `${String(Math.round(value * 100))}%`;
const seconds = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const count = (value: number | null): string =>
  value === null ? '—' : Math.round(value).toLocaleString('en-US');
const usd = (value: number | null): string => (value === null ? 'unknown' : `$${value.toFixed(4)}`);

/**
 * Renders a self-contained Markdown report from stored evidence only, so a
 * report can be regenerated at any time and always matches the database.
 */
export function renderExperimentReport(
  experiment: Experiment,
  comparison: Comparison,
  runs: readonly RunSummary[],
): string {
  const { baseline, candidate } = comparison;
  const ci = comparison.confidenceInterval;
  const duration =
    experiment.startedAt && experiment.finishedAt
      ? Date.parse(experiment.finishedAt) - Date.parse(experiment.startedAt)
      : null;
  const terminations = (arm: 'baseline' | 'candidate'): string => {
    const armRuns = runs.filter((run) => run.arm === arm && run.status === 'scored');
    const byKind = new Map<string, number>();
    for (const run of armRuns)
      byKind.set(run.termination ?? 'unknown', (byKind.get(run.termination ?? 'unknown') ?? 0) + 1);
    return [...byKind].map(([kind, n]) => `${kind} ${String(n)}`).join(', ') || '—';
  };
  const retried = runs.filter((run) => run.attempts > 1).length;

  const lines = [
    `# ${experiment.name}`,
    '',
    `Generated from stored results by HighEval. Experiment \`${experiment.id}\`, status **${experiment.status}**.`,
    '',
    '## Verdict',
    '',
    `**${VERDICT_TEXT[comparison.verdict]}.** ${comparison.verdictReason}`,
    '',
    '| Statistic | Value |',
    '| --- | --- |',
    `| Direction | candidate − baseline (task score, 0–1) |`,
    `| Mean difference | ${signed(comparison.meanDifference)} |`,
    `| ${ci ? `${String(Math.round(ci.level * 100))}% CI (paired bootstrap, ${ci.resamples.toLocaleString('en-US')} resamples)` : 'Confidence interval'} | ${ci ? `[${signed(ci.lower)}, ${signed(ci.upper)}]` : '—'} |`,
    `| Sign-flip permutation test | ${comparison.pValue === null ? '—' : `p = ${comparison.pValue.toFixed(3)}`} |`,
    `| Wins / losses / ties (tasks) | ${String(comparison.wins)} / ${String(comparison.losses)} / ${String(comparison.ties)} |`,
    `| Practical margin | ±${comparison.practicalMargin.toFixed(2)} |`,
    `| Paired tasks | ${String(comparison.pairedTasks)} of ${String(comparison.totalTasks)}, ${String(comparison.repetitions)} repetition(s) each |`,
    '',
    '## Setup',
    '',
    '| | Baseline | Candidate |',
    '| --- | --- | --- |',
    `| Config | ${experiment.baseline.name} | ${experiment.candidate.name} |`,
    `| Model | \`${experiment.baseline.model.model}\` | \`${experiment.candidate.model.model}\` |`,
    `| Skills | ${experiment.baseline.skills.map((skill) => `\`${skill.name}\``).join(', ') || 'none'} | ${experiment.candidate.skills.map((skill) => `\`${skill.name}\``).join(', ') || 'none'} |`,
    `| Memory | ${experiment.baseline.memory.mode} | ${experiment.candidate.memory.mode} |`,
    `| Toolsets | ${experiment.baseline.toolsets.join(', ') || 'none'} | ${experiment.candidate.toolsets.join(', ') || 'none'} |`,
    `| Max turns / timeout | ${String(experiment.baseline.maxTurns)} / ${String(experiment.baseline.timeoutSeconds)} s | ${String(experiment.candidate.maxTurns)} / ${String(experiment.candidate.timeoutSeconds)} s |`,
    `| Config hash | \`${experiment.baseline.hash.slice(0, 16)}\` | \`${experiment.candidate.hash.slice(0, 16)}\` |`,
    '',
    `Suite **${experiment.suiteName}** (task hash \`${experiment.suiteHash.slice(0, 16)}\`), ${String(experiment.repetitions)} repetition(s) per task per arm, run order and resampling seed \`${String(experiment.seed)}\`.`,
    duration === null
      ? ''
      : `Wall-clock time ${seconds(duration)} for ${String(runs.length)} runs.`,
    '',
    '## Per-arm results',
    '',
    '| Metric | Baseline | Candidate |',
    '| --- | --- | --- |',
    `| Mean task score | ${score(baseline.meanScore)} | ${score(candidate.meanScore)} |`,
    `| Pass rate (runs) | ${percent(baseline.passRate)} | ${percent(candidate.passRate)} |`,
    `| Scored / errored runs | ${String(baseline.scoredRuns)} / ${String(baseline.erroredRuns)} | ${String(candidate.scoredRuns)} / ${String(candidate.erroredRuns)} |`,
    `| Run outcomes | ${terminations('baseline')} | ${terminations('candidate')} |`,
    `| Mean duration per run | ${seconds(baseline.meanDurationMs)} | ${seconds(candidate.meanDurationMs)} |`,
    `| Mean tokens per run | ${count(baseline.meanTotalTokens)} | ${count(candidate.meanTotalTokens)} |`,
    `| Total tokens | ${count(baseline.totalTokens)} | ${count(candidate.totalTokens)} |`,
    `| Model API calls | ${count(baseline.totalApiCalls)} | ${count(candidate.totalApiCalls)} |`,
    `| Provider cost | ${usd(baseline.totalCostUsd)} | ${usd(candidate.totalCostUsd)} |`,
    ...(baseline.judgeRequests + candidate.judgeRequests > 0
      ? [
          `| LLM-judge requests (scoring) | ${count(baseline.judgeRequests)} | ${count(candidate.judgeRequests)} |`,
          `| LLM-judge tokens | ${count(baseline.judgeTokens)} | ${count(candidate.judgeTokens)} |`,
          `| LLM-judge cost | ${usd(baseline.judgeCostUsd)} | ${usd(candidate.judgeCostUsd)} |`,
        ]
      : []),
    '',
    retried > 0
      ? `${String(retried)} run(s) needed more than one attempt (rate limits or restarts); only final attempts are scored.`
      : 'No run needed a retry.',
    '',
    '## Per-task results',
    '',
    '| Task | Baseline | Candidate | Difference |',
    '| --- | ---: | ---: | ---: |',
    ...comparison.tasks.map(
      (task) =>
        `| ${task.title} (\`${task.taskKey}\`) | ${score(task.baselineMean)} | ${score(task.candidateMean)} | ${signed(task.difference)} |`,
    ),
    '',
    'Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.',
    '',
  ];
  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
}
