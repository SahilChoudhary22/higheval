# HighEval

Evaluate whether a [Hermes Agent](https://github.com/NousResearch/hermes-agent) got better, worse, or stayed the same when its model, skills, memory, or tools change, with evidence.

> **Status:** early scaffold. Execution, scoring, and comparison are in progress.

## Repository layout

| Path              | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `apps/api`        | NestJS API: definitions, experiment orchestration, scoring, statistics |
| `apps/web`        | Vue 3 SPA: suites, configurations, experiments, run inspection         |
| `packages/shared` | Zod schemas and types forming the API contract                         |

## Prerequisites

- Node.js 22.18+ (see `.nvmrc`) with Corepack enabled (`corepack enable pnpm`)
- [uv](https://docs.astral.sh/uv/) and git (used to install the pinned Hermes runtime)
- An OpenRouter API key (free models are sufficient)

## Development

```bash
cp .env.example .env   # then set OPENROUTER_API_KEY
pnpm install
pnpm setup:hermes      # installs pinned Hermes into ./.hermes-runtime (≈1 min, ≈1.3 GB)
pnpm dev               # API on :3000, web on :5173 (proxies /api)
```

## Quality checks

```bash
pnpm check                                # format, lint, typecheck, unit tests, build
pnpm --filter @higheval/api test:e2e      # API end-to-end with a deterministic fake executor
pnpm --filter @higheval/api test:live     # real Hermes + OpenRouter: verifies tools/skills/memory isolation
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by a commit-msg hook.
