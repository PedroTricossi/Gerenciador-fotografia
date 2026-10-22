# WeasyPrint needs Homebrew's lib folder on macOS. macOS strips DYLD_* variables
# from processes started through make or sh, so it is passed inline on each command.
ifeq ($(shell uname -s),Darwin)
BREW_LIB := $(shell brew --prefix)/lib
endif

UV := cd backend && DYLD_FALLBACK_LIBRARY_PATH="$(BREW_LIB)" uv
NPM := cd frontend && npm

.PHONY: install install-backend install-frontend run dev dev-backend dev-frontend check check-backend check-frontend openapi build api-types e2e

install: install-backend install-frontend

install-backend:
	$(UV) sync --locked

install-frontend:
	$(NPM) ci

# Backend and Vite together. Vite proxies /api to the backend and keeps the browser's Host.
dev:
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend:
	$(UV) run python -m gerenciador

dev-frontend:
	$(NPM) run dev

build:
	$(NPM) run build

# Builds the interface when it is missing or older than its sources, then serves it.
run: frontend/dist/index.html
	$(UV) run python -m gerenciador

frontend/dist/index.html: $(shell find frontend/src frontend/index.html frontend/vite.config.ts frontend/package-lock.json -type f 2>/dev/null)
	$(NPM) run build

# The app serves no schema. This writes it to openapi.json at the repository root.
openapi:
	$(UV) run python -m gerenciador.export_openapi ../openapi.json

# Regenerates the frontend's API types from the backend's route definitions.
api-types: openapi
	$(NPM) run api-types

# Tools run as modules (`python -m`), not through their console scripts: with a long
# path uv starts a script through /bin/sh, and macOS then drops the library path.
check-backend:
	$(UV) run python -m ruff format --check .
	$(UV) run python -m ruff check .
	$(UV) run python -m mypy src
	$(UV) run python -m pytest --cov=gerenciador --cov-report=term-missing --cov-fail-under=90
	$(UV) run python -m coverage report --include="*/gerenciador/domain/*" --fail-under=100
	$(UV) run python -m pip_audit

check-frontend:
	$(NPM) run format:check
	$(NPM) run lint
	$(NPM) run typecheck
	$(NPM) run test:coverage
	$(NPM) audit --audit-level=high
	frontend/scripts/check-api-types.sh

check: check-backend check-frontend

# Builds the interface and runs Playwright against the real backend on a temporary database.
# First time only: cd frontend && npx playwright install chromium
e2e: build
	cd frontend && npx playwright test
