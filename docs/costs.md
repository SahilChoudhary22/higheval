# Approximate costs

Figures marked **measured** come from the experiments in [experiments/](experiments). Figures marked **estimate** apply list prices or simple projections to those measurements. Missing provider prices are treated as unknown, not zero.

## Summary

| Item                                                                   | Cost                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Model inference for the reported experiments (free endpoints)          | **$0** (measured)                                                          |
| Same experiments at paid list prices                                   | **≈ $0.002 per run**, ≈ $0.18 per 96-run experiment (estimate)             |
| A 96-run experiment on a frontier-priced model ($2 / $10 per M tokens) | **≈ $3** (estimate)                                                        |
| Infrastructure                                                         | **$0 extra** locally; ≈ $5–10 / month for an always-on small VM, if wanted |
| Wall-clock time per experiment                                         | ~22 min for 96 runs at concurrency 3 (measured)                            |

## 1. Model inference

### What a run consumes (measured)

From the model-change experiment (16 tasks × 3 repetitions per arm, file tools, 12-turn limit):

| Per run                 | Nemotron 3 Super | Nemotron 3.5 Lightning |
| ----------------------- | ---------------: | ---------------------: |
| Model API calls         |              3.4 |                    4.1 |
| Input tokens (uncached) |            7,243 |                  7,935 |
| Cached input tokens     |            8,103 |                 16,200 |
| Output tokens           |            1,508 |                  3,409 |
| Total tokens            |           16,854 |                 27,544 |
| Wall-clock duration     |             25 s |                   51 s |

Most input is Hermes' system prompt and tool schemas, resent on every turn; providers that support prompt caching serve much of it from cache. Agentic runs cost several requests each, not one. That matters on free tiers, which limit **requests**, not tokens.

### Free tier (what was used)

Both models were called through OpenRouter `:free` endpoints, so provider cost was **$0**. Hermes recorded a cost of 0 for every run. The binding constraint is the request quota: this key reports **1,000 free-model requests per day**, and accounts without purchased credits get far fewer.

| Experiment                      | Runs | Model requests (measured) |
| ------------------------------- | ---: | ------------------------: |
| Pilot, 12 tasks × 1 rep         |   24 |                        69 |
| Model change, 16 tasks × 3 reps |   96 |                       361 |
| Skill change, 16 tasks × 2 reps |   64 |                       279 |

Hermes retries rate-limited calls internally (up to 3 times), and HighEval retries the whole run on a 429. Both kinds of retry consume quota, so leave 20–30% headroom when planning an experiment.

### Paid equivalents (estimate)

The measured token counts above, multiplied by OpenRouter list prices on 12 Oct 2026 (USD per million tokens, input / output / cached input):

| Model                                     | Prices              |   Per run | One arm (48 runs) |
| ----------------------------------------- | ------------------- | --------: | ----------------: |
| Nemotron 3 Super (paid endpoint)          | 0.08 / 0.45 / 0.08* |   $0.0019 |             $0.09 |
| Nemotron 3.5 Lightning (paid endpoint)    | 0.07 / 0.20 / 0.04  |   $0.0019 |             $0.09 |
| GPT-6 Luna (Super's token profile)        | 0.10 / 0.50 / 0.01  | ≈ $0.0016 |           ≈ $0.08 |
| Claude Sonnet 5.5 (Super's token profile) | 2.00 / 10.00 / 0.10 |  ≈ $0.030 |           ≈ $1.46 |

\* No cache price is listed for Super's paid endpoint, so cached tokens are priced as normal input, an upper bound.

Two takeaways. First, a cheaper per-token model is not cheaper per task if it needs more turns: Lightning's lower prices were fully offset by 63% more tokens. Second, a full two-arm, 96-run experiment costs cents on small models and a few dollars on frontier-priced ones. Using a different model's token profile is only an approximation, because models differ in verbosity and turn count. HighEval records actual tokens and API calls per run, so real costs can be read after a pilot.

### LLM judge (measured)

In a real judged run on the Customer conversations suite (6 runs, both arms), the judge (`cohere/north-mini-code:free`) used **one request per judged run** and about **1,250 tokens per verdict**, including its hidden reasoning. The agent's own runs on those single-reply tasks used one model call and about 3,900 tokens each, so judging adds roughly a third to the token bill and doubles the request count for conversational tasks. Cost was $0 on the free endpoint. At a frontier judge's list price ($2 / $10 per million tokens) a verdict like that would cost roughly $0.005. Judge requests, tokens and cost are reported per arm, separately from the agent's.

## 2. Compute and storage (measured on an Apple-silicon Mac)

| Resource                         | Usage                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API process (Node.js)            | ~40 MB RSS idle                                                                                                                                                                  |
| Each concurrent Hermes run       | ~80 MB RSS, mostly idle waiting on the provider (~3% CPU each)                                                                                                                   |
| 4 concurrent runs                | ~330 MB RAM, ~11% of one core                                                                                                                                                    |
| Hermes runtime, installed once   | ~1.3 GB in `.hermes-runtime/`                                                                                                                                                    |
| Per-run artifacts kept for audit | ~7.7 MB apparent. 5 MB of that is a model-catalog snapshot shared as a copy-on-write clone where the filesystem supports it (APFS, Btrfs), so actual new disk is ~2.5 MB per run |
| Database                         | SQLite, a few MB per thousand runs (events and scores)                                                                                                                           |

Workloads are I/O-bound on the model provider. A modest machine (2 vCPU, 2 GB RAM) can run 4–8 concurrent agents; concurrency is limited by provider rate limits before local resources.

## 3. Hosting

- **Local (default):** no cost beyond the machine you already have. Everything runs from `pnpm start` in one process, with no database server or queue to operate.
- **Always-on demo:** any small Linux VM or single-board computer with Node.js 22 and ~3 GB free disk (≈ $5–10 / month on common VPS providers, $0 on hardware you own). Put authentication in front before exposing it: anyone who can launch experiments can spend your provider quota.

## 4. People time

| Activity                                     | Time                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| First start, including Hermes install        | ~2 minutes                                                                                                                              |
| Writing a new task with fixtures and scorers | 10–20 minutes. Computing expected answers by script and adding a reference solution is the slow, important part                         |
| A 96-run experiment                          | ~22 minutes of wall-clock time at concurrency 3 on free endpoints (under a minute for a Quick check); no attention needed while it runs |
| Reviewing an experiment                      | 5–15 minutes, mostly in the run inspector on discordant tasks                                                                           |
