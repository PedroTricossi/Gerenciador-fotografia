# WeasyPrint needs Homebrew's lib folder on macOS. macOS strips DYLD_* variables
# from processes started through make or sh, so it is passed inline on each command.
ifeq ($(shell uname -s),Darwin)
BREW_LIB := $(shell brew --prefix)/lib
endif

UV := cd backend && DYLD_FALLBACK_LIBRARY_PATH="$(BREW_LIB)" uv

.PHONY: install run check

install:
	$(UV) sync

run:
	$(UV) run python -m gerenciador

check:
	$(UV) run ruff format --check .
	$(UV) run ruff check .
	$(UV) run mypy src
	$(UV) run pytest --cov=gerenciador --cov-report=term-missing --cov-fail-under=90
	$(UV) run coverage report --include="*/gerenciador/domain/*" --fail-under=100
	$(UV) run pip-audit
