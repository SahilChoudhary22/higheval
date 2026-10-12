#!/usr/bin/env bash
# One-command local start: checks prerequisites, installs dependencies,
# provisions the pinned Hermes runtime, builds, and serves API + UI on one port.
# Safe to re-run; every step is idempotent and fast when already done.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\033[36m[higheval]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[higheval]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[higheval]\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || fail "Node.js 22.18+ is required (see .nvmrc)."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || fail "Node.js 22.18+ is required; found $(node --version)."
command -v pnpm >/dev/null || fail "pnpm is required: run 'corepack enable pnpm'."
command -v git >/dev/null || fail "git is required."
command -v uv >/dev/null || fail "uv is required to install Hermes: https://docs.astral.sh/uv/getting-started/installation/"

if [[ ! -f .env ]]; then
  cp .env.example .env
  warn "Created .env from .env.example. Add OPENROUTER_API_KEY to run experiments."
fi

log "Installing dependencies"
pnpm install --frozen-lockfile

log "Provisioning Hermes"
pnpm setup:hermes

log "Building"
pnpm build

log "Starting"
NODE_ENV=production exec node apps/api/dist/main.js
