#!/usr/bin/env bash
# Fails when src/api/schema.d.ts is not what the backend's current routes generate.
set -euo pipefail
cd "$(dirname "$0")/../.."
make api-types >/dev/null
if ! git diff --quiet -- frontend/src/api/schema.d.ts; then
  echo "frontend/src/api/schema.d.ts is out of date. Run 'make api-types' and commit the result." >&2
  git --no-pager diff --stat -- frontend/src/api/schema.d.ts >&2
  exit 1
fi
echo "API types are current."
