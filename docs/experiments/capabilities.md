# Capability experiments

The two experiments in [model-change.md](model-change.md) and [skill-change.md](skill-change.md) are honest results: on the Agency operations suite, neither change made a difference the data could confirm, so HighEval said _inconclusive_. These five experiments show the other side: when a configuration change does matter, HighEval detects it with a small suite, one repetition and free models.

Each pairs two configurations of the **same model** (Nemotron 3 Super, free) that differ in exactly **one setting**. Each runs a suite of 8 tasks that only that setting makes answerable. Every fact in the tasks is invented, so the model cannot answer from its training data. The suites, skills and configurations are seeded with the samples, so anyone can rerun them; each experiment takes 30–90 seconds and 16–21 model requests. The persona experiment was run on the hosted deployment, through its public URL, as an end-to-end check of the deployed platform.

| Experiment                                                              | Setting changed                                 | Verdict    | Mean difference (95% CI)           | Wins / losses |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ---------- | ---------------------------------- | ------------- |
| [Service catalog skill](#skill-service-catalog-on-nemotron-3-super)     | + `lakeshore-service-catalog` skill (knowledge) | **Better** | +1.000 [+1.000, +1.000], p = 0.008 | 8 / 0         |
| [Email house style skill](#skill-email-house-style-on-nemotron-3-super) | + `lakeshore-email-style` skill (procedure)     | **Better** | +0.738 [+0.675, +0.800], p = 0.008 | 8 / 0         |
| [Quill persona](#persona-quill-soulmd-on-nemotron-3-super)              | Hermes' built-in persona → Quill's `SOUL.md`    | **Better** | +0.719 [+0.656, +0.750], p = 0.008 | 8 / 0         |
| [Client memory](#memory-client-facts-on-nemotron-3-super)               | memory off → seeded with 8 client facts         | **Better** | +1.000 [+1.000, +1.000], p = 0.008 | 8 / 0         |
| [File tools removed](#tools-file-tools-removed-from-nemotron-3-super)   | `file` toolset → no tools                       | **Worse**  | −0.938 [−1.000, −0.813], p = 0.008 | 0 / 8         |

With 8 tasks that all move the same way, the exact sign-flip test gives p = 2/2⁸ ≈ 0.008, and the rule would still call a direction with up to two tied tasks. Compare the model-change experiment: 96 runs, but only 3 of 16 tasks differed, so it stayed inconclusive.

## What the run inspector shows

- **Knowledge skill.** Asked for a three-service bundle price, the baseline replied `{"monthly_price": 1200}`, an invented number; with the skill the agent applied the 12% bundle discount and replied `1399`. Asked who handles a suspended ad account, the baseline said it was not sure; the candidate named Ravi Menon.
- **Procedure skill.** Without the skill, the invoice reminder was a reasonable email in the model's own style (`Subject: Friendly Reminder: …`, `$1,240`, `November 3, 2026`, signed by an invented name). With it, every rule was followed: `Subject: [Lakeshore] …`, `USD 1,240.00`, `3 Nov 2026`, `— The Lakeshore team`. The baseline still earned partial credit (greeting, no exclamation marks), which is why the difference is +0.738 rather than +1.
- **Persona.** With Hermes' built-in persona, the agent answered tersely in its own voice: _"Sorry for the delay—I'll prioritize completing and sending this month's report immediately."_ With Quill's `SOUL.md` it greeted the client by name, acknowledged the frustration, offered a call with the account team instead of promising a date, and signed off as Quill. A skill teaches the agent something; a persona changes who it is. The one imperfect reply greeted "Hi Jo Kim," with the full name, so that task scored 0.75.
- **Memory.** With memory off, the model could not know a client's account manager or retainer; with eight seeded facts it answered every question, including one that needed reasoning on top of memory (2026-11-15 is in fiscal Q3 when the year starts on April 1).
- **Tools.** Without the `file` toolset, the agent could not read the workspace. It printed a would-be tool call as plain text (`{"action": "read", "path": "…/app.log"}`) or guessed: it got the number of unpaid invoices right by chance (3) but invented the total ($450.75 instead of $7,040.50), hence one task at 0.5. Removing tools also cut tokens per run from about 9,000 to 1,100, which the per-arm table reports.

These suites are deliberately easy to separate: they demonstrate that the configuration controls really change what the agent can do, and that the statistics recognise a real effect. They say nothing about which model is better.

---

## Skill: service catalog on Nemotron 3 Super

Generated from stored results by HighEval. Experiment `6fae2a7b-8714-4dfc-b7a8-034e8e833ca1`, status **completed**.

### Verdict

**Candidate is better.** Mean difference +1.000 (95% CI [+1.000, +1.000], p = 0.008) over 8 tasks. The interval excludes zero and the permutation test agrees.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | +1.000                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [+1.000, +1.000]                       |
| Sign-flip permutation test                  | p = 0.008                              |
| Wins / losses / ties (tasks)                | 8 / 0 / 0                              |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 8 of 8, 1 repetition(s) each           |

### Setup

|                     | Baseline                                 | Candidate                                           |
| ------------------- | ---------------------------------------- | --------------------------------------------------- |
| Config              | Nemotron 3 Super · no tools              | Nemotron 3 Super · no tools + service catalog skill |
| Model               | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/nemotron-3-super-120b-a12b:free`            |
| Skills              | none                                     | `lakeshore-service-catalog`                         |
| Memory              | disabled                                 | disabled                                            |
| Toolsets            | none                                     | none                                                |
| Max turns / timeout | 12 / 240 s                               | 12 / 240 s                                          |
| Config hash         | `18bd5d1df8204507`                       | `a29e1e5b2ea710bd`                                  |

Suite **Capability: service catalog** (task hash `1e4cc991464cc21e`), 1 repetition(s) per task per arm, run order and resampling seed `784699128`.
Wall-clock time 35.3 s for 16 runs.

### Per-arm results

| Metric                | Baseline    | Candidate   |
| --------------------- | ----------- | ----------- |
| Mean task score       | 0.000       | 1.000       |
| Pass rate (runs)      | 0%          | 100%        |
| Scored / errored runs | 8 / 0       | 8 / 0       |
| Run outcomes          | completed 8 | completed 8 |
| Mean duration per run | 9.9 s       | 6.6 s       |
| Mean tokens per run   | 1,309       | 1,745       |
| Total tokens          | 10,469      | 13,956      |
| Model API calls       | 8           | 8           |
| Provider cost         | $0.0000     | $0.0000     |

No run needed a retry.

### Per-task results

| Task                                                     | Baseline | Candidate | Difference |
| -------------------------------------------------------- | -------: | --------: | ---------: |
| Service code (`catalog-service-code`)                    |    0.000 |     1.000 |     +1.000 |
| Bundle price (`catalog-bundle-price`)                    |    0.000 |     1.000 |     +1.000 |
| Bundle with annual prepay (`catalog-bundle-prepay`)      |    0.000 |     1.000 |     +1.000 |
| Prepay without a bundle (`catalog-prepay-rounding`)      |    0.000 |     1.000 |     +1.000 |
| Non-profit, two services (`catalog-nonprofit-small`)     |    0.000 |     1.000 |     +1.000 |
| Non-profit versus bundle (`catalog-nonprofit-best-deal`) |    0.000 |     1.000 |     +1.000 |
| Support target (`catalog-support-target`)                |    0.000 |     1.000 |     +1.000 |
| Escalation contact (`catalog-escalation`)                |    0.000 |     1.000 |     +1.000 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

---

## Skill: email house style on Nemotron 3 Super

Generated from stored results by HighEval. Experiment `2ea1b162-274c-48f2-a9d2-d985c5121e37`, status **completed**.

### Verdict

**Candidate is better.** Mean difference +0.738 (95% CI [+0.675, +0.800], p = 0.008) over 8 tasks. The interval excludes zero and the permutation test agrees.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | +0.738                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [+0.675, +0.800]                       |
| Sign-flip permutation test                  | p = 0.008                              |
| Wins / losses / ties (tasks)                | 8 / 0 / 0                              |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 8 of 8, 1 repetition(s) each           |

### Setup

|                     | Baseline                                 | Candidate                                       |
| ------------------- | ---------------------------------------- | ----------------------------------------------- |
| Config              | Nemotron 3 Super · no tools              | Nemotron 3 Super · no tools + email style skill |
| Model               | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/nemotron-3-super-120b-a12b:free`        |
| Skills              | none                                     | `lakeshore-email-style`                         |
| Memory              | disabled                                 | disabled                                        |
| Toolsets            | none                                     | none                                            |
| Max turns / timeout | 12 / 240 s                               | 12 / 240 s                                      |
| Config hash         | `18bd5d1df8204507`                       | `c1134f12069c240d`                              |

Suite **Capability: email house style** (task hash `aa7642e25e12f31b`), 1 repetition(s) per task per arm, run order and resampling seed `793251173`.
Wall-clock time 30.5 s for 16 runs.

### Per-arm results

| Metric                | Baseline    | Candidate   |
| --------------------- | ----------- | ----------- |
| Mean task score       | 0.263       | 1.000       |
| Pass rate (runs)      | 0%          | 100%        |
| Scored / errored runs | 8 / 0       | 8 / 0       |
| Run outcomes          | completed 8 | completed 8 |
| Mean duration per run | 6.6 s       | 7.6 s       |
| Mean tokens per run   | 1,183       | 1,623       |
| Total tokens          | 9,467       | 12,986      |
| Model API calls       | 8           | 8           |
| Provider cost         | $0.0000     | $0.0000     |

No run needed a retry.

### Per-task results

| Task                                                | Baseline | Candidate | Difference |
| --------------------------------------------------- | -------: | --------: | ---------: |
| Invoice reminder (`style-invoice-reminder`)         |    0.333 |     1.000 |     +0.667 |
| Payment received (`style-payment-received`)         |    0.167 |     1.000 |     +0.833 |
| Campaign launch (`style-campaign-launch`)           |    0.167 |     1.000 |     +0.833 |
| Meeting confirmation (`style-meeting-confirmation`) |    0.200 |     1.000 |     +0.800 |
| Retainer change (`style-price-change`)              |    0.333 |     1.000 |     +0.667 |
| Advertising pause (`style-ad-pause`)                |    0.400 |     1.000 |     +0.600 |
| Refund processed (`style-refund`)                   |    0.167 |     1.000 |     +0.833 |
| Budget alert (`style-overspend`)                    |    0.333 |     1.000 |     +0.667 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

---

## Memory: client facts on Nemotron 3 Super

Generated from stored results by HighEval. Experiment `7b9a8e88-2c08-411b-92d7-b411c5d2b41c`, status **completed**.

### Verdict

**Candidate is better.** Mean difference +1.000 (95% CI [+1.000, +1.000], p = 0.008) over 8 tasks. The interval excludes zero and the permutation test agrees.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | +1.000                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [+1.000, +1.000]                       |
| Sign-flip permutation test                  | p = 0.008                              |
| Wins / losses / ties (tasks)                | 8 / 0 / 0                              |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 8 of 8, 1 repetition(s) each           |

### Setup

|                     | Baseline                                 | Candidate                                   |
| ------------------- | ---------------------------------------- | ------------------------------------------- |
| Config              | Nemotron 3 Super · no tools              | Nemotron 3 Super · no tools + client memory |
| Model               | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/nemotron-3-super-120b-a12b:free`    |
| Skills              | none                                     | none                                        |
| Memory              | disabled                                 | seeded                                      |
| Toolsets            | none                                     | none                                        |
| Max turns / timeout | 12 / 240 s                               | 12 / 240 s                                  |
| Config hash         | `18bd5d1df8204507`                       | `fcac1719fefecd76`                          |

Suite **Capability: client memory** (task hash `74cad7d30abb86d8`), 1 repetition(s) per task per arm, run order and resampling seed `1674773582`.
Wall-clock time 25.8 s for 16 runs.

### Per-arm results

| Metric                | Baseline    | Candidate   |
| --------------------- | ----------- | ----------- |
| Mean task score       | 0.000       | 1.000       |
| Pass rate (runs)      | 0%          | 100%        |
| Scored / errored runs | 8 / 0       | 8 / 0       |
| Run outcomes          | completed 8 | completed 8 |
| Mean duration per run | 6.9 s       | 5.0 s       |
| Mean tokens per run   | 1,146       | 1,381       |
| Total tokens          | 9,167       | 11,044      |
| Model API calls       | 8           | 8           |
| Provider cost         | $0.0000     | $0.0000     |

No run needed a retry.

### Per-task results

| Task                                       | Baseline | Candidate | Difference |
| ------------------------------------------ | -------: | --------: | ---------: |
| Account manager (`memory-account-manager`) |    0.000 |     1.000 |     +1.000 |
| Report delivery (`memory-report-format`)   |    0.000 |     1.000 |     +1.000 |
| Retainer terms (`memory-retainer`)         |    0.000 |     1.000 |     +1.000 |
| Advertising pause (`memory-ad-pause`)      |    0.000 |     1.000 |     +1.000 |
| Client contact (`memory-contact`)          |    0.000 |     1.000 |     +1.000 |
| Budget cap (`memory-budget-cap`)           |    0.000 |     1.000 |     +1.000 |
| Brand colour (`memory-brand-colour`)       |    0.000 |     1.000 |     +1.000 |
| Fiscal quarter (`memory-fiscal-quarter`)   |    0.000 |     1.000 |     +1.000 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

---

## Tools: file tools removed from Nemotron 3 Super

Generated from stored results by HighEval. Experiment `a36327fc-ddbb-4f34-9e37-369a3cf09594`, status **completed**.

### Verdict

**Candidate is worse.** Mean difference −0.938 (95% CI [−1.000, −0.813], p = 0.008) over 8 tasks. The interval excludes zero and the permutation test agrees.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | −0.938                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [−1.000, −0.813]                       |
| Sign-flip permutation test                  | p = 0.008                              |
| Wins / losses / ties (tasks)                | 0 / 8 / 0                              |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 8 of 8, 1 repetition(s) each           |

### Setup

|                     | Baseline                                 | Candidate                                |
| ------------------- | ---------------------------------------- | ---------------------------------------- |
| Config              | Nemotron 3 Super · file tools            | Nemotron 3 Super · no tools              |
| Model               | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/nemotron-3-super-120b-a12b:free` |
| Skills              | none                                     | none                                     |
| Memory              | disabled                                 | disabled                                 |
| Toolsets            | file                                     | none                                     |
| Max turns / timeout | 12 / 240 s                               | 12 / 240 s                               |
| Config hash         | `df1556f0359ad3c6`                       | `18bd5d1df8204507`                       |

Suite **Capability: reading files** (task hash `60319f74ac87cc52`), 1 repetition(s) per task per arm, run order and resampling seed `1856420488`.
Wall-clock time 35.4 s for 16 runs.

### Per-arm results

| Metric                | Baseline    | Candidate   |
| --------------------- | ----------- | ----------- |
| Mean task score       | 1.000       | 0.063       |
| Pass rate (runs)      | 100%        | 0%          |
| Scored / errored runs | 8 / 0       | 8 / 0       |
| Run outcomes          | completed 8 | completed 8 |
| Mean duration per run | 8.7 s       | 6.1 s       |
| Mean tokens per run   | 8,975       | 1,108       |
| Total tokens          | 71,802      | 8,861       |
| Model API calls       | 21          | 8           |
| Provider cost         | $0.0000     | $0.0000     |

No run needed a retry.

### Per-task results

| Task                                                      | Baseline | Candidate | Difference |
| --------------------------------------------------------- | -------: | --------: | ---------: |
| Unpaid invoices (`files-unpaid-invoices`)                 |    1.000 |     0.500 |     −0.500 |
| Largest active campaign (`files-largest-active-campaign`) |    1.000 |     0.000 |     −1.000 |
| Contact email (`files-contact-email`)                     |    1.000 |     0.000 |     −1.000 |
| Items to reorder (`files-reorder`)                        |    1.000 |     0.000 |     −1.000 |
| Agreed review date (`files-meeting-date`)                 |    1.000 |     0.000 |     −1.000 |
| Errors in a log (`files-error-count`)                     |    1.000 |     0.000 |     −1.000 |
| Configured setting (`files-digest-setting`)               |    1.000 |     0.000 |     −1.000 |
| Average rating (`files-average-rating`)                   |    1.000 |     0.000 |     −1.000 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

## Persona: Quill SOUL.md on Nemotron 3 Super

Generated from stored results by HighEval. Experiment `d4835f2e-e2c1-478b-82de-bfb58de69f57`, status **completed**.

### Verdict

**Candidate is better.** Mean difference +0.719 (95% CI [+0.656, +0.750], p = 0.008) over 8 tasks. The interval excludes zero and the permutation test agrees.

| Statistic                                   | Value                                  |
| ------------------------------------------- | -------------------------------------- |
| Direction                                   | candidate − baseline (task score, 0–1) |
| Mean difference                             | +0.719                                 |
| 95% CI (paired bootstrap, 10,000 resamples) | [+0.656, +0.750]                       |
| Sign-flip permutation test                  | p = 0.008                              |
| Wins / losses / ties (tasks)                | 8 / 0 / 0                              |
| Practical margin                            | ±0.05                                  |
| Paired tasks                                | 8 of 8, 1 repetition(s) each           |

### Setup

|                          | Baseline                                 | Candidate                                   |
| ------------------------ | ---------------------------------------- | ------------------------------------------- |
| Config                   | Nemotron 3 Super · no tools              | Nemotron 3 Super · no tools + Quill persona |
| Model                    | `nvidia/nemotron-3-super-120b-a12b:free` | `nvidia/nemotron-3-super-120b-a12b:free`    |
| Skills                   | none                                     | none                                        |
| Memory                   | disabled                                 | disabled                                    |
| Persona (SOUL.md)        | Hermes default                           | custom                                      |
| Instructions (AGENTS.md) | none                                     | none                                        |
| Toolsets                 | none                                     | none                                        |
| Max turns / timeout      | 12 / 240 s                               | 12 / 240 s                                  |
| Config hash              | `18bd5d1df8204507`                       | `f2e104cf5da1be1d`                          |

Suite **Capability: persona** (task hash `2c10f29849e25017`), 1 repetition(s) per task per arm, run order and resampling seed `120527555`.
Wall-clock time 86.4 s for 16 runs.

### Per-arm results

| Metric                | Baseline    | Candidate   |
| --------------------- | ----------- | ----------- |
| Mean task score       | 0.250       | 0.969       |
| Pass rate (runs)      | 0%          | 88%         |
| Scored / errored runs | 8 / 0       | 8 / 0       |
| Run outcomes          | completed 8 | completed 8 |
| Mean duration per run | 20.6 s      | 20.1 s      |
| Mean tokens per run   | 1,142       | 1,131       |
| Total tokens          | 9,133       | 9,048       |
| Model API calls       | 8           | 8           |
| Provider cost         | $0.0000     | $0.0000     |

No run needed a retry.

### Per-task results

| Task                                     | Baseline | Candidate | Difference |
| ---------------------------------------- | -------: | --------: | ---------: |
| Ads stopped showing (`persona-ads-down`) |    0.250 |     1.000 |     +0.750 |
| Discount request (`persona-discount`)    |    0.250 |     1.000 |     +0.750 |
| Launch date (`persona-launch-date`)      |    0.250 |     1.000 |     +0.750 |
| Late report (`persona-late-report`)      |    0.250 |     1.000 |     +0.750 |
| Adding a service (`persona-add-service`) |    0.250 |     1.000 |     +0.750 |
| Charged twice (`persona-double-charge`)  |    0.250 |     1.000 |     +0.750 |
| Ranking guarantee (`persona-guarantee`)  |    0.250 |     1.000 |     +0.750 |
| Low engagement (`persona-engagement`)    |    0.250 |     0.750 |     +0.500 |

Scores are means over repetitions. A task is paired only when both arms have at least one scored run; errored runs are infrastructure failures and are excluded rather than counted as zero.

---

Evidence bundles (every run's events, scores and replies): [service catalog](capability-skill.evidence.json), [email house style](capability-procedure-skill.evidence.json), [Quill persona](capability-persona.evidence.json), [client memory](capability-memory.evidence.json), [tools removed](capability-tools.evidence.json).
