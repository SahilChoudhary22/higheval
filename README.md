<img src="docs/images/logo.svg" alt="HighEval logo" width="96" />

# HighEval

**Did the agent get better, worse, or stay the same?** HighEval answers that with evidence. It runs the same task suite under two [Hermes Agent](https://github.com/NousResearch/hermes-agent) configurations (different model, skills, memory or tools), scores every run with deterministic checks, and reports the paired difference with a confidence interval and an explicit verdict. Every individual run can be opened to see why it passed or failed.

- **Define tasks and scoring:** suites of tasks with fixture files and typed scorers (JSON fields with tolerances, regexes, files created, tools used), each producing a readable reason.
- **Define configurations:** model, skills, Hermes' built-in skills (off by default), memory (off or seeded) and toolsets, snapshotted and hashed at launch.
- **Run them:** each run in its own fresh Hermes environment (configuration, skills, memory and workspace), with retries, cancellation, hard timeouts and restart recovery.
- **Compare with confidence:** paired per-task differences, a 95% bootstrap interval, a permutation test and a verdict rule fixed before data.
- **Inspect a run:** scorer results, final reply, tool-call timeline, workspace files, tokens, API calls and cost.

## Quick start

Prerequisites: **macOS or Linux** (Windows via WSL2 is untested), **Node.js 22.18+** with Corepack (`corepack enable pnpm`), **[uv](https://docs.astral.sh/uv/)**, **git**, and an **[OpenRouter](https://openrouter.ai) API key**. The sample configurations use free models, but free-model request limits depend on your account: a Quick check uses about 30 requests and a full 96-run experiment about 360.

```bash
pnpm start
```

That one command:

1. Checks prerequisites.
2. Creates `.env` from `.env.example` on first run.
3. Installs dependencies.
4. Installs the pinned Hermes runtime into `./.hermes-runtime`. This happens once, takes about 1 minute and about 1.3 GB, and writes nothing to your home directory.
5. Builds everything and serves the app at **http://127.0.0.1:3000**.

Add your key to `.env` (`OPENROUTER_API_KEY=…`) and run `pnpm start` again. The UI shows what's missing until then.

On first start the database is seeded with two sample suites, a skill and three configurations, so you can launch an experiment immediately.

### Try it in about a minute

**Launch experiment** → suite **Quick check** (preselected) → set **Repetitions** to 1 → **Launch experiment**. The 10 runs finish in about a minute on free models (41 s measured), with a verdict, per-task results and an inspectable timeline for every run.

### How long a full experiment takes

Almost all of the time goes to waiting on the model: each run makes 3–5 model calls, and free OpenRouter endpoints take about 10 s per call. A run therefore averages 30–50 s, and an experiment takes roughly _runs × 40 s ÷ concurrency_. The 96-run model-change experiment took 22 minutes at concurrency 3. The launch form shows this estimate before you start, and a running experiment shows time remaining. To go faster, raise `MAX_CONCURRENT_RUNS` within the provider's rate limits, or use paid endpoints, which have far higher rate limits than the free tier.

## The sample task set

[`Agency operations`](apps/api/src/samples/agency-ops-suite.ts) has 16 synthetic back-office tasks for a marketing agency ([`Quick check`](apps/api/src/samples/quick-check-suite.ts) is a fast five-task subset):

- billing: receivables, payment reminders, commission
- CRM hygiene: lead qualification, duplicate contacts, contact extraction
- scheduling: double bookings
- compliance: SMS quiet hours, refund policy
- reporting: pipeline forecast, attribution, ROI, churn, SLAs, reorder quantities

Each task has exactly one correct answer, deliberate edge cases (boundary dates, time zones, partial payments, tiered thresholds), and a reference solution that must score 1.0 in the test suite. Expected answers live only in scorer definitions and are never written into the agent's workspace.

Seeded configurations:

| Config                                                | Purpose                |
| ----------------------------------------------------- | ---------------------- |
| Nemotron 3 Super · file tools                         | Baseline model         |
| Nemotron 3.5 Lightning · file tools                   | Model-change candidate |
| Nemotron 3.5 Lightning · file tools + checklist skill | Skill-change candidate |

None of them use Hermes' 58 built-in skills. A configuration can opt into all of them or a selection; the choice is recorded and hashed like any other setting ([design decision 2](docs/design.md#2-every-run-starts-from-a-clean-separate-environment-and-the-separation-is-tested)).

## Results

Two real experiments, each comparing two configurations on the 16-task sample suite. The skill experiment ran on a revision that clarified two task prompts found to be ambiguous during the first experiment.

| Experiment                                       | Change                                     | Runs | Verdict                                         | Headline                                                                                       |
| ------------------------------------------------ | ------------------------------------------ | ---: | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Model change](docs/experiments/model-change.md) | Nemotron 3 Super → Nemotron 3.5 Lightning  |   96 | Inconclusive (Δ −0.104, 95% CI [−0.229, 0.000]) | Lightning won no task, lost 3, and was 2× slower. Don't switch on this evidence                |
| [Skill change](docs/experiments/skill-change.md) | Lightning without → with a checklist skill |   64 | Inconclusive (Δ −0.030, 95% CI [−0.083, 0.000]) | The skill changed behaviour (more output verification) but not outcomes, and added 25% latency |

Each report is generated by the platform from stored results (`GET /api/experiments/:id/report.md`), followed by a written analysis that traces failures through the run inspector. Each ships with its full JSON evidence bundle.

## Documentation

| Document                                   | Contents                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| [docs/design.md](docs/design.md)           | Architecture, key decisions and alternatives, data model, assumptions, testing strategy |
| [docs/limitations.md](docs/limitations.md) | Known limits of the evidence, execution and product scope                               |
| [docs/costs.md](docs/costs.md)             | Measured and estimated costs of running the system                                      |
| [docs/experiments/](docs/experiments)      | Reports and raw evidence from the real experiments                                      |

## Repository layout

```
apps/api          NestJS API: definitions, experiment runner, Hermes executor, scoring, statistics
apps/web          Vue 3 SPA
packages/shared   Zod schemas: the API contract shared by both apps
scripts/          start.sh (one-command start), setup-hermes.sh (pinned runtime)
docs/             design, limitations, costs, experiment reports
```

## Development

```bash
pnpm install
pnpm setup:hermes   # once
pnpm dev            # API on :3000 (watch), web on :5173 with /api proxied
```

| Command                                 | What it does                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm check`                            | Format check, lint (type-aware), typecheck, unit tests, build                           |
| `pnpm --filter @higheval/api test:e2e`  | API end-to-end through HTTP with a deterministic fake executor                          |
| `pnpm --filter @higheval/api test:live` | Real Hermes + OpenRouter: verifies tool, skill and memory isolation (uses ~10 requests) |

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by a commit-msg hook. CI runs the full check, plus the e2e tests, on pushes to `main` and on pull requests.

### Configuration

All settings are optional except the provider key. They are validated at startup, and the app refuses to boot on invalid values.

| Variable              | Default                         | Purpose                                                                                    |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY`  | —                               | Provider key used by Hermes                                                                |
| `HOST` / `PORT`       | `127.0.0.1` / `3000`            | Bind address. Keep it local unless behind an authenticating proxy                          |
| `DATA_DIR`            | `./data`                        | SQLite database and per-run artifacts                                                      |
| `MAX_CONCURRENT_RUNS` | `4`                             | Parallel agent runs across all experiments                                                 |
| `MAX_RUN_ATTEMPTS`    | `3`                             | Attempts for retryable failures (rate limits, restarts)                                    |
| `RETRY_BASE_DELAY_MS` | `15000`                         | First retry delay; doubles each attempt                                                    |
| `SEED_SAMPLES`        | `true`                          | Seed the sample suites into an empty database                                              |
| `ALLOWED_HOSTS`       | —                               | Extra hostnames the API answers to (e.g. a tunnel's public name); other hosts are rejected |
| `HERMES_MANIFEST`     | `.hermes-runtime/manifest.json` | Where `setup-hermes` records the installed runtime                                         |
| `LOG_FORMAT`          | `pretty`                        | `json` for structured logs                                                                 |

## License

MIT
