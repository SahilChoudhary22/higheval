<p align="center">
  <img src="docs/images/logo.svg" alt="HighEval" width="112" />
</p>

<h1 align="center">HighEval</h1>

<p align="center">
  <strong>A/B evaluations for <a href="https://github.com/NousResearch/hermes-agent">Hermes Agent</a>.</strong><br />
  Change the model, skills, memory or tools, and find out whether the agent got better, worse, or stayed the same, with evidence.
</p>

<p align="center">
  <a href="https://github.com/SahilChoudhary22/higheval/actions/workflows/ci.yml"><img src="https://github.com/SahilChoudhary22/higheval/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Node.js-22.18%2B-5fa04e?logo=nodedotjs&logoColor=white" alt="Node.js 22.18+" />
  <img src="https://img.shields.io/badge/OpenAPI-3.1-6ba539?logo=openapiinitiative&logoColor=white" alt="OpenAPI 3.1" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#results">Results</a> ·
  <a href="docs/design.md">Design</a> ·
  <a href="docs/limitations.md">Limitations</a> ·
  <a href="docs/costs.md">Costs</a> ·
  <a href="#api">API</a>
</p>

<p align="center">
  <img src="docs/images/experiment-results.png" alt="An experiment's verdict: the confidence interval for candidate minus baseline, the decision rule's inputs, and per-configuration results" width="880" />
</p>

HighEval runs the same task suite under two Hermes configurations, scores every run, and reports the paired difference with a 95% confidence interval and a verdict from a rule fixed before the data. It never calls a difference real when the evidence can't support it, and every run can be opened to see exactly why it passed or failed.

## Features

- **Tasks and scoring.** Suites of tasks with fixture files and typed scorers: JSON fields with tolerances, regular expressions, files created, tools used, and a pinned LLM judge for conversational quality. Every scorer explains its result, and hard rules can be marked `required`.
- **Draft suites with Hermes.** Describe what to test in plain language. Hermes writes the tasks, fixtures and scorers, computes expected values with a script, and HighEval checks the draft against the schema and Hermes' own reference answers before you review it.
- **Configurations.** Provider and model, skills, Hermes' built-in skills, memory (off or seeded), toolsets and limits, snapshotted and hashed at launch so edits never rewrite history.
- **Isolated, durable runs.** Every run gets a fresh Hermes home, workspace and environment. Runs are interleaved in a seeded random order, with retries, cancellation, hard timeouts and restart recovery.
- **Statistics you can defend.** Paired per-task differences, a seeded 95% bootstrap interval, an exact sign-flip permutation test, and an explicit equivalence margin.
- **Run inspector.** Scorer results, the final reply, the tool-call timeline, workspace files, tokens, API calls and cost for every run.
- **Seven providers.** OpenRouter, OpenAI, Anthropic, Google AI Studio, DeepSeek, xAI and NVIDIA NIM, with keys managed in the app.
- **Typed API.** Every endpoint is described by an OpenAPI 3.1 document generated from the same Zod schemas that validate it.

<p align="center">
  <img src="docs/images/run-inspector.png" alt="The run inspector: three failing scorers, the agent's final reply with the correct dates, and run metadata" width="880" />
  <br /><sub>A failed run, opened in the inspector. The agent computed the right dates but never wrote the file.</sub>
</p>

## Quick start

**Prerequisites:**

- macOS or Linux (Windows through WSL2 is untested)
- [Node.js](https://nodejs.org) 22.18+ with Corepack (`corepack enable pnpm`)
- [uv](https://docs.astral.sh/uv/) and git
- An [OpenRouter](https://openrouter.ai) API key

```bash
git clone https://github.com/SahilChoudhary22/higheval.git
cd higheval
pnpm start
```

One command does the setup. It:

1. Checks prerequisites.
2. Creates `.env` on first run.
3. Installs dependencies.
4. Installs the pinned Hermes runtime into `./.hermes-runtime`. This happens once, takes about a minute and about 1.3 GB, and leaves your home directory untouched.
5. Serves the app at **http://127.0.0.1:3000**.

Open **Settings** and paste your OpenRouter key; it's verified with the provider before it's saved. The database is seeded with sample suites, a skill and three configurations, so you can launch an experiment right away.

### Try it in a minute

**Launch experiment** → suite **Quick check** (preselected) → **Repetitions** 1 → **Launch experiment**. The 10 runs finish in about a minute on free models, with a verdict, per-task results and an inspectable timeline for every run.

A full experiment takes longer because nearly all the time is spent waiting on the model. Each run makes 3–5 calls, and free endpoints take about 10 s per call, so plan on roughly _runs × 40 s ÷ concurrency_. The 96-run model-change experiment took 22 minutes at concurrency 3. The launch form shows this estimate before you start.

Free-model request limits depend on your OpenRouter account: a Quick check uses about 30 requests and a 96-run experiment about 360.

### Draft a suite with Hermes

Go to **Suites → Draft with Hermes** and describe what to test, for example:

> Three tasks for a dental clinic front desk: find double-booked appointments (back-to-back slots are fine), compute no-show fees with a 24-hour grace period, and list patients due for a six-month check-up.

Hermes works in an isolated workspace with:

- the suite's JSON Schema
- two known-good example tasks
- an authoring skill

It writes the suite and a reference solution for each task. HighEval then requires every deterministic scorer to pass against that reference, and sends any problems back for another attempt. The draft opens in the editor for you to review; nothing is saved until you save it. You can follow up with changes ("make the second task stricter"), and Hermes revises the draft. See [design decision 10](docs/design.md#10-hermes-drafts-suites-higheval-checks-them).

## How it works

```mermaid
flowchart LR
  L[Launch] -->|snapshot + hash<br/>seeded interleaving| Q[(Run queue)]
  Q --> H[Hermes run<br/>fresh home + workspace]
  H --> S[Scorers<br/>checks + LLM judge]
  S --> C[Paired comparison<br/>CI · permutation test]
  C --> V{Verdict}
  V --> B[Better]
  V --> W[Worse]
  V --> E[Equivalent]
  V --> I[Inconclusive]
```

The verdict is fixed before any data comes in:

| Verdict         | Requires                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Better or worse | The 95% interval excludes zero **and** the exact permutation test agrees (p ≤ 0.05).                                             |
| Equivalent      | The interval lies inside the practical margin **and** the suite has enough tasks to rule out a hidden difference (≥ 3 ÷ margin). |
| Not enough data | Fewer than 5 paired tasks.                                                                                                       |
| Inconclusive    | Anything else.                                                                                                                   |

[docs/design.md](docs/design.md) covers the architecture, the isolation guarantees (and the live test that proves them), failure classification, and the alternatives considered.

## Sample suites

| Suite                                                                          | Tasks | What it tests                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Agency operations](apps/api/src/samples/agency-ops-suite.ts)                  |    16 | Back-office work for a marketing agency: billing, CRM hygiene, scheduling, compliance and reporting, with deliberate edge cases (boundary dates, time zones, partial payments, tiered thresholds)                   |
| [Quick check](apps/api/src/samples/quick-check-suite.ts)                       |     5 | A fast subset of Agency operations, for demos                                                                                                                                                                       |
| [Customer conversations](apps/api/src/samples/customer-conversations-suite.ts) |     3 | Customer replies. Hard rules (states the refund window, quotes no prices, fits in one SMS) are `required` checks; empathy, accuracy and a clear next step are rated by a pinned judge from a different model family |

Every deterministic task has a reference solution that must score 1.0 in CI. Expected answers live only in the scorers and are never written into the agent's workspace.

## Results

Two real experiments on the Agency operations suite, each comparing two configurations:

| Experiment                                       | Change                                     | Runs | Verdict                                           | Takeaway                                                                                  |
| ------------------------------------------------ | ------------------------------------------ | ---: | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Model change](docs/experiments/model-change.md) | Nemotron 3 Super → Nemotron 3.5 Lightning  |   96 | Inconclusive<br/>Δ −0.104, 95% CI [−0.229, 0.000] | Lightning won no task, lost 3, and was 2× slower. Don't switch on this evidence.          |
| [Skill change](docs/experiments/skill-change.md) | Lightning without → with a checklist skill |   64 | Inconclusive<br/>Δ −0.030, 95% CI [−0.083, 0.000] | The skill changed behaviour (more output checks) but not outcomes, and added 25% latency. |

Each report was generated by the platform from stored results (`GET /api/experiments/:id/report.md`), then extended with a written analysis that traces failures through the run inspector. The full JSON evidence for each ships next to its report.

## API

The web app is a client of a documented REST API:

|                           |                                                                        |
| ------------------------- | ---------------------------------------------------------------------- |
| **Interactive reference** | **http://127.0.0.1:3000/api/docs**, also linked from the app's sidebar |
| **OpenAPI 3.1 document**  | `GET /api/openapi.json`                                                |

The document is generated at startup from the running controllers and the shared Zod schemas, so it always matches what the server validates. A test fails if any route is undocumented. Validation errors return field-level `issues`:

```bash
curl -s -X POST http://127.0.0.1:3000/api/experiments \
  -H 'Content-Type: application/json' -d '{"name": "x"}'
# {"message":"Validation failed","issues":[{"path":"suiteId","message":"Required"}, …]}
```

## Configuration

Every setting is optional and validated at startup; the app refuses to boot on an invalid value. Provider keys can also be managed in **Settings**, where a saved key overrides `.env`.

| Variable                                 | Default                                                 | Purpose                                                                                           |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                     | —                                                       | OpenRouter key, used by the sample configurations, the LLM judge and the suite assistant          |
| `<PROVIDER>_API_KEY`                     | —                                                       | Keys for other providers: `OPENAI`, `ANTHROPIC`, `GEMINI`, `DEEPSEEK`, `XAI`, `NVIDIA`            |
| `HOST` / `PORT`                          | `127.0.0.1` / `3000`                                    | Bind address. Keep it local unless the app sits behind an authenticating proxy                    |
| `ALLOWED_HOSTS`                          | —                                                       | Extra hostnames the API answers to (for example a tunnel's public name); other hosts are rejected |
| `DATA_DIR`                               | `./data`                                                | SQLite database and per-run artifacts                                                             |
| `MAX_CONCURRENT_RUNS`                    | `4`                                                     | Parallel agent runs across all experiments                                                        |
| `MAX_RUN_ATTEMPTS`                       | `3`                                                     | Attempts for retryable failures (rate limits, restarts)                                           |
| `RETRY_BASE_DELAY_MS`                    | `15000`                                                 | First retry delay for runs; doubles each attempt                                                  |
| `JUDGE_RETRY_BASE_DELAY_MS`              | `2000`                                                  | First retry delay for rate-limited judge calls; doubles each attempt                              |
| `ASSISTANT_PROVIDER` / `ASSISTANT_MODEL` | `openrouter` / `nvidia/nemotron-3-super-120b-a12b:free` | Model the suite assistant drafts with                                                             |
| `SEED_SAMPLES`                           | `true`                                                  | Seed the sample definitions into an empty database                                                |
| `HERMES_MANIFEST`                        | `.hermes-runtime/manifest.json`                         | Where the Hermes setup script records the installed runtime                                       |
| `LOG_FORMAT`                             | `pretty`                                                | `json` for structured logs                                                                        |

## Development

```bash
pnpm install
pnpm setup:hermes   # once
pnpm dev            # API on :3000 (watch), web on :5173 with /api proxied
```

| Command                                 | What it does                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm check`                            | Format check, type-aware lint, typecheck, unit tests and build: what CI runs              |
| `pnpm --filter @higheval/api test:cov`  | Unit and e2e tests with coverage thresholds (about 92% of lines)                          |
| `pnpm --filter @higheval/api test:e2e`  | The API over HTTP, with a deterministic fake executor                                     |
| `pnpm --filter @higheval/api test:live` | Real Hermes and a real model: proves tool, skill and memory isolation (about 10 requests) |

### Engineering practices

- **Tooling:** strict TypeScript; oxlint (type-aware) plus ESLint for Vue; Prettier.
- **Commits and CI:** Conventional Commits, enforced by a commit hook. CI runs on every push to `main` and on every pull request.
- **Supply chain:** dependencies may not run install scripts unless allowlisted, and new releases must age before pnpm installs them.

### Repository layout

```
apps/api          NestJS API: definitions, experiment runner, Hermes executor, scoring,
                  statistics, suite assistant, provider keys, OpenAPI
apps/web          Vue 3 single-page app
packages/shared   Zod schemas: the API contract shared by both apps
scripts/          start.sh (one-command start), setup-hermes.sh (pinned runtime)
docs/             design, limitations, costs, experiment reports
```

## Documentation

| Document                           | Contents                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Design](docs/design.md)           | Architecture, key decisions and the alternatives considered, data model, assumptions, testing strategy |
| [Limitations](docs/limitations.md) | Known limits of the evidence, the execution environment and the product                                |
| [Costs](docs/costs.md)             | Measured and estimated costs of models, compute, hosting and people's time                             |
| [Experiments](docs/experiments)    | Reports and raw evidence from the real experiments                                                     |

## Roadmap

- **MCP server:** expose suites, experiments and verdicts as tools, so an agent (Hermes included) can run its own evaluations.
- **Sandboxing:** run each agent in a container through Hermes' Docker terminal backend, for untrusted agents and tasks.
- **Pairwise judging, calibrated against human labels, and multi-turn conversations** (designed in [docs/design.md](docs/design.md#evaluating-conversational-agents)).
- **Scale-out:** a worker queue, Postgres and live progress over server-sent events.

## License

[MIT](LICENSE)
