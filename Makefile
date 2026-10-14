# WeasyPrint needs Homebrew's lib folder on macOS. macOS strips DYLD_* variables
# from processes started through make or sh, so it is passed inline on each command.
ifeq ($(shell uname -s),Darwin)
BREW_LIB := $(shell brew --prefix)/lib
endif

UV := cd backend && DYLD_FALLBACK_LIBRARY_PATH="$(BREW_LIB)" uv

.PHONY: install run check openapi

install:
	$(UV) sync

run:
	$(UV) run python -m gerenciador

# The app serves no schema. This writes it to openapi.json at the repository root.
openapi:
	$(UV) run python -m gerenciador.export_openapi ../openapi.json

# Tools run as modules (`python -m`), not through their console scripts: with a long
# path uv starts a script through /bin/sh, and macOS then drops the library path.
check:
	$(UV) run python -m ruff format --check .
	$(UV) run python -m ruff check .
	$(UV) run python -m mypy src
	$(UV) run python -m pytest --cov=gerenciador --cov-report=term-missing --cov-fail-under=90
	$(UV) run python -m coverage report --include="*/gerenciador/domain/*" --fail-under=100
	$(UV) run python -m pip_audit
