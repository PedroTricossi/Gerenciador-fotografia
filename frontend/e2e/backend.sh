#!/usr/bin/env bash
# Starts the real backend for end-to-end tests: a fresh database and fresh keys in a
# temporary folder, serving the built frontend. Never touches data/ or the keys in .env:
# environment variables take precedence over .env.
set -euo pipefail
PORT="${1:-8765}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT/backend"
if [[ "$(uname -s)" == "Darwin" ]]; then
  export DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib"
fi
eval "$(uv run python -m gerenciador.keygen | sed 's/^/export /')"
export CONTRACTOR_NAME="Fotografia Teste"
export CONTRACTOR_CPF="111.444.777-35"
export CONTRACTOR_ADDRESS="Rua Exemplo 1 - Centro"
export CONTRACTOR_REPRESENTATIVE="Pessoa Teste"
export DATABASE_PATH="$WORK/data/e2e.db"
export FRONTEND_DIST="$ROOT/frontend/dist"
export HOST="127.0.0.1"
export PORT
uv run python -m gerenciador
