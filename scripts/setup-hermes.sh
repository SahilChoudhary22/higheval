#!/usr/bin/env bash
# Installs a pinned Hermes Agent into ./.hermes-runtime without touching the
# user's home directory, shell rc files or PATH. Idempotent: exits quickly when
# the pinned commit is already installed.
#
# Output: .hermes-runtime/manifest.json, read by the API to launch Hermes.
set -euo pipefail

HERMES_REPO_URL="https://github.com/NousResearch/hermes-agent.git"
HERMES_COMMIT="73162b00eefde3794bed0afb53d84a19c0eed230"
PYTHON_VERSION="3.14"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/.hermes-runtime"
REPO="$RUNTIME/hermes-agent"
MANIFEST="$RUNTIME/manifest.json"

log() { printf '\033[36m[hermes-setup]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[hermes-setup]\033[0m %s\n' "$*" >&2; exit 1; }

if [[ -f "$MANIFEST" ]] && grep -q "\"commit\": \"$HERMES_COMMIT\"" "$MANIFEST"; then
  python_path="$(sed -n 's/.*"python": "\(.*\)".*/\1/p' "$MANIFEST")"
  if [[ -x "$python_path" ]]; then
    log "Hermes ${HERMES_COMMIT:0:7} already installed"
    exit 0
  fi
fi

command -v git >/dev/null || fail "git is required"
command -v uv >/dev/null || fail "uv is required (https://docs.astral.sh/uv/getting-started/installation/)"

mkdir -p "$RUNTIME"

if [[ ! -d "$REPO/.git" ]]; then
  log "Cloning Hermes Agent"
  git init -q "$REPO"
  git -C "$REPO" remote add origin "$HERMES_REPO_URL"
fi
if [[ "$(git -C "$REPO" rev-parse HEAD 2>/dev/null || true)" != "$HERMES_COMMIT" ]]; then
  log "Fetching pinned commit ${HERMES_COMMIT:0:7}"
  git -C "$REPO" fetch -q --depth 1 origin "$HERMES_COMMIT"
  git -C "$REPO" checkout -q --detach "$HERMES_COMMIT"
fi

log "Resolving Python $PYTHON_VERSION via uv"
uv python install -q "$PYTHON_VERSION"
BOOT_PY="$(uv python find "$PYTHON_VERSION")"

# Hermes' package manager installs its own pinned toolchain (Python, uv, node,
# ripgrep, ffmpeg) and the locked venv. Everything is confined to RUNTIME: an
# install-owner HERMES_HOME, a tool store, and a throwaway HOME so nothing is
# written to the real user profile. Browser and computer-use tools are skipped.
log "Installing Hermes dependencies (first run takes a few minutes)"
(
  cd "$REPO"
  env -u PYTHONHOME -u PYTHONPATH -u VIRTUAL_ENV \
    HOME="$RUNTIME/home" \
    HERMES_HOME="$RUNTIME/install-home" \
    HERMES_RUNTIME_DIR="$RUNTIME/runtime" \
    UV_NO_CONFIG=1 \
    UV_CACHE_DIR="$RUNTIME/cache/uv" \
    "$BOOT_PY" -m pm.cli install --without agent-browser --without cua-driver
)

facts="$(ls "$RUNTIME"/install-home/installs/*/facts.json 2>/dev/null | head -n 1)"
[[ -n "$facts" ]] || fail "Dependency install did not produce facts.json"
VENV="$("$BOOT_PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["packages"]["venv"]["environment"])' "$facts")"
VENV_PY="$VENV/bin/python"
[[ -x "$VENV_PY" ]] || fail "Hermes venv interpreter not found at $VENV_PY"

log "Verifying installation"
version="$(
  cd "$REPO" && env -i PATH=/usr/bin:/bin HOME="$RUNTIME/home" \
    HERMES_HOME="$RUNTIME/install-home" HERMES_RUNTIME_DIR="$RUNTIME/runtime" \
    "$VENV_PY" -I -c "import sys; sys.path.insert(0, '$REPO'); import hermes_bootstrap; from hermes_cli.main import main; sys.exit(main())" --version 2>&1 | head -n 1
)"
[[ "$version" == Hermes* ]] || fail "Hermes did not start: $version"

cat > "$MANIFEST" <<JSON
{
  "commit": "$HERMES_COMMIT",
  "repo": "$REPO",
  "python": "$VENV_PY",
  "runtimeDir": "$RUNTIME/runtime",
  "version": "$version"
}
JSON
log "Ready: $version"
