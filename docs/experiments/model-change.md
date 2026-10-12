# Model change: Lightning vs Super

Generated from stored results by HighEval. Experiment `94757e54-a8cc-456f-bdf8-e9ea659c1acb`, status **completed**.

## Verdict

**Inconclusive.** Mean difference −0.104 (95% CI [−0.229, 0.000]) over 16 tasks. The interval includes zero but also differences larger than the ±0.05 margin; more tasks or repetitions are needed.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | −0.104                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [−0.229, 0.000]                        |
| Sign-flip permutation test                  | p = 0.250                              |
| Wins / losses / ties (tasks)                | 0 / 3 / 13                             |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 16 of 16, 3 repetition(s) each         |

## Setup

|                     | Baseline                                 | Candidate                            |
| ------------------- | ---------------------------------------- | ------------------------------------ |
| Config              | Nemotron 3 Super · file tools            | Nemotron 3.5 Lightning · file tools  |
| Model               | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/nemotron-3.5-lightning:free` |
| Skills              | none                                     | none                                 |
| Memory              | disabled                                 | disabled                             |
| Toolsets            | file                                     | file                                 |
| Max turns / timeout | 12 / 240 s                               | 12 / 240 s                           |
| Config hash         | `a00caacaba26e8f1`                       | `538f68929374a831`                   |

Suite **Agency operations** (task hash `e3fa2564df4db0c2`), 3 repetition(s) per task per arm, run order and resampling seed `1000738355`.
Wall-clock time 1329.4 s for 96 runs.

## Per-arm results

| Metric                | Baseline     | Candidate                 |
| --------------------- | ------------ | ------------------------- |
| Mean task score       | 0.943        | 0.839                     |
| Pass rate (runs)      | 88%          | 77%                       |
| Scored / errored runs | 48 / 0       | 48 / 0                    |
| Run outcomes          | completed 48 | completed 47, max_turns 1 |
| Mean duration per run | 25.1 s       | 51.3 s                    |
| Mean tokens per run   | 16,854       | 27,544                    |
| Total tokens          | 808,996      | 1,322,110                 |
| Model API calls       | 165          | 196                       |
| Provider cost         | $0.0000      | $0.0000                   |

No run needed a retry.

## Per-task results

| Task                                                        | Baseline | Candidate | Difference |
| ----------------------------------------------------------- | -------: | --------: | ---------: |
| Overdue receivables (`overdue-invoices`)                    |    1.000 |     1.000 |      0.000 |
| Qualify inbound leads (`lead-qualification`)                |    1.000 |     1.000 |      0.000 |
| Find double bookings (`appointment-conflicts`)              |    1.000 |     1.000 |      0.000 |
| Refund: eligible purchase (`refund-within-window`)          |    1.000 |     1.000 |      0.000 |
| Refund: opened software (`refund-opened-software`)          |    1.000 |     1.000 |      0.000 |
| Extract a contact from an email (`contact-extraction`)      |    1.000 |     1.000 |      0.000 |
| Weighted pipeline forecast (`pipeline-forecast`)            |    0.933 |     0.933 |      0.000 |
| Merge duplicate contacts (`duplicate-contacts`)             |    1.000 |     1.000 |      0.000 |
| SMS quiet-hours compliance (`sms-quiet-hours`)              |    1.000 |     0.333 |     −0.667 |
| Campaign ROI ranking (`campaign-roi`)                       |    0.600 |     0.600 |      0.000 |
| Churn-risk tiers (`churn-risk`)                             |    1.000 |     1.000 |      0.000 |
| Support SLA breaches (`support-sla-breaches`)               |    1.000 |     1.000 |      0.000 |
| Quarterly tiered commission (`tiered-commission`)           |    1.000 |     1.000 |      0.000 |
| Payment reminder schedule (`dunning-schedule`)              |    1.000 |     0.333 |     −0.667 |
| Position-based revenue attribution (`position-attribution`) |    1.000 |     0.667 |     −0.333 |
| Inventory reorder with case packs (`reorder-quantities`)    |    0.556 |     0.556 |      0.000 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

---

## Analysis

_Everything above this line is generated by HighEval from stored results (`GET /api/experiments/:id/report.md`). This section is written by hand._

**Question.** Should we replace Nemotron 3 Super with the newer Nemotron 3.5 Lightning, holding skills (none), memory (off) and tools (file) fixed?

**Answer: don't switch on this evidence.** The pre-registered rule returns _inconclusive_. That means the data cannot exclude "no difference" at 95%, and it also cannot rule out a difference larger than the ±0.05 margin, so equivalence cannot be claimed either. Everything that did move, moved against the candidate:

- Lightning won **no** task and lost 3 of 16. Its mean score is 0.104 lower and its pass rate 11 points lower.
- With only 3 discordant tasks, the exact sign-flip test gives p = 0.25. The bootstrap interval's upper end sits exactly at 0.000 because 13 of 16 tasks tie, so about 3.6% of resamples ((13/16)^16) contain no losing task at all. That is enough to keep zero inside a 95% interval. The tool reports this as inconclusive rather than rounding it into a "worse" claim.
- Lightning was also **2× slower** per run (51 s vs 25 s), used **63% more tokens** and **19% more API calls**. "Lightning" is not faster in an agent loop when it takes more turns to finish.

**Why Lightning lost (from the run inspector).**

| Task                       | Failing runs | Cause seen in the timeline                                                                                                                                                                                                      |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMS quiet-hours compliance | 2 of 3       | Wrote Python helper scripts it had no way to run (file tools only, no terminal). One run hit the 12-turn limit; the other finally wrote `violations.json` into Hermes' scratch directory instead of the workspace               |
| Payment reminder schedule  | 2 of 3       | Computed the **correct** dates, but wrote `reminders.json` outside the working directory: once into Hermes' advertised scratch directory (`HERMES_HOME/cache/scratch`), once via an absolute path one level above the workspace |
| Position-based attribution | 1 of 3       | Arithmetic error splitting credit across middle touchpoints (e.g. `email` 984 vs 1,137.33)                                                                                                                                      |

The second row is worth noting. Hermes tells the agent about a scratch directory in its system prompt, and Lightning sometimes treats it as the place for deliverables. Both arms received identical prompts, so this is a real instruction-following difference rather than an artefact. It would be invisible from scores alone; the inspector shows the exact `write_file` path.

**Measurement issues found after the run.** Two tasks scored identically low for both models in every repetition:

- `campaign-roi`: the prompt labels campaigns "Reactivation (Email)", so both models returned that label where the scorer expected "Reactivation".
- `reorder-quantities`: "order enough to reach N units" was read as "order N units".

Because both arms failed these identically, they contribute 0 to every paired difference and cannot bias the verdict, though they do reduce the suite's sensitivity. Their wording was clarified in a later revision (commit `2296ce6`, expected answers unchanged). This experiment is reported **as run** on suite revision `e3fa2564…`, and was not rescored.

**Cost.** Both arms ran on free OpenRouter endpoints ($0). At the same models' paid list prices (Super $0.08 / $0.45, Lightning $0.07 / $0.20 per million input/output tokens, Lightning cache reads $0.04 per million), this experiment would have cost about **$0.18**, or roughly $0.0019 per run for either model. Lightning's lower prices are almost exactly cancelled by its extra tokens.

**What would make this conclusive.** More tasks rather than more repetitions. Only 3 of 16 tasks discriminate between the models, and within-task repetitions were already consistent. Extra tasks that require writing deliverables to a stated path, and multi-step arithmetic, are where Lightning showed weakness.

Raw evidence (experiment snapshot, comparison, and every run with scores and event timeline): [`model-change.evidence.json`](model-change.evidence.json).
