# Skill change: checklist skill on Lightning

Generated from stored results by HighEval. Experiment `f1ad413c-7440-474c-b59e-391d141f47b7`, status **completed**.

## Verdict

**Inconclusive.** Mean difference −0.030 (95% CI [−0.083, 0.000]) over 16 tasks. The interval includes zero but also differences larger than the ±0.05 margin; more tasks or repetitions are needed.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | −0.030                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [−0.083, 0.000]                        |
| Sign-flip permutation test                  | p = 0.500                              |
| Wins / losses / ties (tasks)                | 0 / 2 / 14                             |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 16 of 16, 2 repetition(s) each         |

## Setup

|                     | Baseline                             | Candidate                                             |
| ------------------- | ------------------------------------ | ----------------------------------------------------- |
| Config              | Nemotron 3.5 Lightning · file tools  | Nemotron 3.5 Lightning · file tools + checklist skill |
| Model               | `nvidia/nemotron-3.5-lightning:free` | `nvidia/nemotron-3.5-lightning:free`                  |
| Skills              | none                                 | `data-task-checklist`                                 |
| Memory              | disabled                             | disabled                                              |
| Toolsets            | file                                 | file                                                  |
| Max turns / timeout | 12 / 240 s                           | 12 / 240 s                                            |
| Config hash         | `538f68929374a831`                   | `ae3ab46d884caafb`                                    |

Suite **Agency operations** (task hash `3c6d5fc84bbe728d`), 2 repetition(s) per task per arm, run order and resampling seed `720007382`.
Wall-clock time 861.8 s for 64 runs.

## Per-arm results

| Metric                | Baseline                  | Candidate                            |
| --------------------- | ------------------------- | ------------------------------------ |
| Mean task score       | 0.890                     | 0.860                                |
| Pass rate (runs)      | 84%                       | 78%                                  |
| Scored / errored runs | 32 / 0                    | 32 / 0                               |
| Run outcomes          | completed 30, max_turns 2 | completed 30, max_turns 1, timeout 1 |
| Mean duration per run | 45.9 s                    | 57.4 s                               |
| Mean tokens per run   | 25,474                    | 27,968                               |
| Total tokens          | 815,159                   | 894,985                              |
| Model API calls       | 134                       | 145                                  |
| Provider cost         | $0.0000                   | $0.0000                              |

No run needed a retry.

## Per-task results

| Task                                                        | Baseline | Candidate | Difference |
| ----------------------------------------------------------- | -------: | --------: | ---------: |
| Overdue receivables (`overdue-invoices`)                    |    0.833 |     0.833 |      0.000 |
| Qualify inbound leads (`lead-qualification`)                |    1.000 |     1.000 |      0.000 |
| Find double bookings (`appointment-conflicts`)              |    1.000 |     1.000 |      0.000 |
| Refund: eligible purchase (`refund-within-window`)          |    1.000 |     1.000 |      0.000 |
| Refund: opened software (`refund-opened-software`)          |    1.000 |     1.000 |      0.000 |
| Extract a contact from an email (`contact-extraction`)      |    1.000 |     1.000 |      0.000 |
| Weighted pipeline forecast (`pipeline-forecast`)            |    0.900 |     0.800 |     −0.100 |
| Merge duplicate contacts (`duplicate-contacts`)             |    1.000 |     1.000 |      0.000 |
| SMS quiet-hours compliance (`sms-quiet-hours`)              |    0.500 |     0.500 |      0.000 |
| Campaign ROI ranking (`campaign-roi`)                       |    1.000 |     1.000 |      0.000 |
| Churn-risk tiers (`churn-risk`)                             |    1.000 |     0.625 |     −0.375 |
| Support SLA breaches (`support-sla-breaches`)               |    1.000 |     1.000 |      0.000 |
| Quarterly tiered commission (`tiered-commission`)           |    1.000 |     1.000 |      0.000 |
| Payment reminder schedule (`dunning-schedule`)              |    0.500 |     0.500 |      0.000 |
| Position-based revenue attribution (`position-attribution`) |    0.500 |     0.500 |      0.000 |
| Inventory reorder with case packs (`reorder-quantities`)    |    1.000 |     1.000 |      0.000 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

---

## Analysis

_Everything above this line is generated by HighEval from stored results (`GET /api/experiments/:id/report.md`). This section is written by hand._

> **Statistics note (added later).** After this report was generated, the decision rule was tightened following a review: _better_ or _worse_ now also requires the exact permutation test to agree (p ≤ 0.05), and _practically equivalent_ requires at least 3/margin paired tasks (60 at ±0.05). Recomputed under the new rule, this experiment's verdict is unchanged: **inconclusive**. The generated text above shows the original wording.

**Question.** Does preloading the `data-task-checklist` skill improve Nemotron 3.5 Lightning on back-office data tasks, holding the model, memory (off) and tools (file) fixed?

**Answer: no improvement is detectable, and the skill is not worth its cost.** The pre-registered rule returns _inconclusive_.

- The interval [−0.083, 0.000] cannot exclude zero.
- It also extends past the −0.05 margin, so equivalence cannot be claimed either.
- The candidate won **no** task and lost 2 of 16 (p = 0.50). Its pass rate fell 6 points, and runs got 25% slower (57 s vs 46 s) with 10% more tokens.

**The skill was active.** Its last step says to re-open the written file and check it. Runs that read their output back after writing rose from **14 of 32** without the skill to **23 of 32** with it. So the skill changed what the agent did; it just did not change outcomes.

**Where the skill arm lost.**

| Task                               | Cause seen in the run inspector                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Churn-risk tiers (0.625 vs 1.000)  | One of two runs omitted _Pinecrest Vet_, the account sitting exactly on the 14-day boundary, from `churn.json` (score 0.25). The other run was perfect. |
| Pipeline forecast (0.800 vs 0.900) | `stage_totals` was wrong in 2 runs with the skill vs 1 without it; the forecast figures themselves were right                                           |

Both losses come down to one or two runs, which is consistent with noise at 2 repetitions.

**What the skill did not fix.** Three tasks sit at 0.500 in **both** arms, and the timelines show why:

- **SMS quiet hours and the reminder schedule:** Lightning repeatedly writes Python helper scripts (`calc.py`, `run.sh`, `check_violations.py`), often into Hermes' scratch directory, but these configurations have only file tools and no terminal, so nothing can execute them. It loops until it hits the 12-turn limit or the timeout, and never writes the deliverable to the workspace. This is the same pattern behind its losses in the [model-change experiment](model-change.md).
- **Position-based attribution:** one run per arm got the arithmetic or the output structure wrong (`email` 657.33 vs 1,137.33; a missing `credit` key).

A generic "be careful" checklist targets neither problem. The obvious follow-ups are a skill that says _you cannot run code: compute directly and write the result to the working directory_, or adding the `terminal` toolset. Each is a config change and one launch.

**Notes on this run.**

- **2 repetitions instead of 3.** The free-tier daily request quota had about 490 requests left, and Lightning averages about 4 requests per run. Three repetitions would have risked exhausting the quota mid-experiment, producing errored runs and lost coverage.
- **Suite revision.** This experiment used the revision with the two clarified task prompts (task hash `3c6d5fc8…`, commit `2296ce6`). Both arms ran on it, so the comparison is unaffected. The clarification is visible in the results: `campaign-roi` and `reorder-quantities` now score 1.000, where both models scored 0.600 and 0.556 in the model-change experiment.
- **Code version.** Runs reused a shared model-catalog snapshot (commit `8b2bf57`), which is why there is no per-run catalog download. That is identical for both arms.

**Cost.** $0 on free endpoints. At Lightning's paid list prices ($0.07 / $0.20 per million input/output tokens, $0.04 cached), the 64 runs would have cost about **$0.12**: $0.055 without the skill and $0.062 with it.

Raw evidence (experiment snapshot, comparison, and every run with scores and event timeline): [`skill-change.evidence.json`](skill-change.evidence.json).
