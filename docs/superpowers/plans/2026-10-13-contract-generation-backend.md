# Contract Generation Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend that stores wedding photography contracts and their clients, renders each contract to PDF from the Markdown template, and records every action in an append-only audit trail.

**Architecture:** A layered FastAPI app: routers translate HTTP, services hold behaviour and own the transaction, repositories hold queries, and a pure `domain` package holds the rules. Personal data lives only in the `clients` table, with CPF and address encrypted per field. SQLite through SQLAlchemy 2.0 and Alembic.

**Tech Stack:** Python 3.13, uv, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2.0 (sync), Alembic, SQLite, Jinja2, markdown-it-py, WeasyPrint, cryptography, num2words, pytest, Hypothesis, pypdf, Ruff, mypy.

**Spec:** `docs/superpowers/specs/2026-10-13-contract-generation-design.md`

**Scope:** This plan covers the backend only (spec sections 2–6, 8 and 9, backend column). The React frontend (spec section 7) gets its own plan after this one is built, because its API types are generated from this backend's OpenAPI schema.

## Global Constraints

- Python 3.13, managed with `uv`. Run every command from `backend/` unless a step says otherwise.
- Lint and format with Ruff. Type-check `src` with mypy strict.
- Coverage gates: 90% lines overall, 100% lines on `gerenciador/domain/`.
- Dependencies point inward: `api` -> `services` -> `repositories`/`domain`. `domain` imports no framework and no third-party package except `num2words`.
- Routers hold no logic. Queries live only in repositories. Services own the transaction: each public write method ends with exactly one `session.commit()`, after its audit event is recorded.
- All IDs are UUID strings except `audit_events.id`, which is an autoincrementing integer.
- All timestamps are timezone-aware UTC. Never create a naive `datetime`.
- Money is an integer number of centavos everywhere. No floats.
- API base path is `/api/v1`. JSON uses `snake_case`.
- Every error response is `application/problem+json` (RFC 9457).
- Name, CPF and address exist only in the `clients` table. They never appear in logs, audit `details`, or problem responses.
- CPF and address are stored only encrypted (AES-256-GCM).
- The server binds only to `127.0.0.1` or `localhost`.
- Tests never use a real person's CPF. Use only these valid test CPFs: `123.456.789-09`, `987.654.321-00`, `111.444.777-35`.
- Do not use `from __future__ import annotations` in `db/models.py` or in Pydantic model modules.
- When a step appends to `backend/tests/conftest.py`, move its imports to the top of the file with the existing ones.
- Never name a method `list`: Python 3.13 evaluates annotations eagerly, so a later `-> list[...]` in the same class body would break.

## Review Focus

1. **Names and addresses containing Markdown or HTML** (`*`, `_`, `#`, `<b>`, `[x](y)`, newlines): they must print literally in the PDF and never change its structure. Test in Task 9.
2. **CPF with stray characters** (`abc12345678909`, `123.456.789-09x`): rejected, not silently stripped to a valid number. Test in Task 1.
3. **Blank strings from a form**: a whitespace-only required field is a `422`; an empty optional field (`""`) is treated as absent and prints "A definir". Test in Task 12.
4. **A malformed pagination cursor**: a `422`, never a `500`. Tests in Tasks 6, 7 and 12.
5. **Totals of R$ 1.000.000,00 or more**: formatted and written in words correctly ("um milhão de reais"). Test in Task 2.

## File Structure

```
.gitignore
.env.example
Makefile
README.md
.pre-commit-config.yaml
.github/workflows/ci.yml
.github/dependabot.yml
base_contract/contract_template.md        Jinja2 + Markdown contract template
backend/
  pyproject.toml
  alembic.ini
  migrations/
    env.py
    versions/0001_initial_schema.py
  src/gerenciador/
    __init__.py
    __main__.py                 `python -m gerenciador` entry point
    main.py                     create_app
    config.py                   Settings, get_settings, generate_key, REPO_ROOT
    keygen.py                   prints two fresh keys
    clock.py                    utcnow
    domain/
      cpf.py                    normalize, format, mask
      money.py                  BRL formatting, amount in words
      contract.py               totals rule, date/time/hours/photographer wording
    db/
      models.py                 Base, Client, Contract, ContractItem, AuditEvent
      session.py                engine and session factory
      migrate.py                run_migrations, init_database
    repositories/
      keyset.py                 newest-first keyset pagination helper
      audit_repository.py
      client_repository.py
      contract_repository.py
    services/
      context.py                RequestContext
      exceptions.py             NotFoundError, ConflictError, StaleVersionError, InvalidCursorError
      pagination.py             Page, encode_cursor, decode_cursor
      crypto.py                 FieldCipher
      audit_service.py
      client_service.py
      contract_service.py
      contract_renderer.py      template -> Markdown -> HTML
      pdf_renderer.py           HTML -> PDF
      contract_document.py      PDF generation use case
    api/
      deps.py                   dependencies
      errors.py                 problem responses and exception handlers
      security.py               SecurityMiddleware
      v1/
        __init__.py             api_router
        schemas.py
        health.py
        contracts.py
        clients.py
        audit.py
  tests/
    conftest.py
    domain/  services/  db/  api/
```

---

### Task 1: Project scaffold and CPF rules

**Files:**
- Create: `.gitignore`, `backend/pyproject.toml` (generated, then edited)
- Create: `backend/src/gerenciador/__init__.py`, `backend/src/gerenciador/domain/__init__.py`, `backend/src/gerenciador/domain/cpf.py`
- Test: `backend/tests/domain/test_cpf.py`

**Interfaces:**
- Produces: `normalize_cpf(value: str) -> str` (returns 11 digits, raises `ValueError("CPF inválido")`), `format_cpf(digits: str) -> str` (`"123.456.789-09"`), `mask_cpf(digits: str) -> str` (`"***.***.***-09"`).

- [ ] **Step 1: Create the project**

Run from the repository root:

```bash
brew install pango
uv init --package --python 3.13 --name gerenciador backend
cd backend
uv add fastapi "uvicorn[standard]" pydantic-settings sqlalchemy alembic jinja2 markdown-it-py weasyprint cryptography num2words
uv add --dev pytest pytest-cov hypothesis httpx pypdf ruff mypy pip-audit pre-commit
mkdir -p src/gerenciador/domain tests/domain
touch src/gerenciador/domain/__init__.py
```

Replace the generated `backend/src/gerenciador/__init__.py` with:

```python
"""Gerenciador de fotografia: backend."""
```

In `backend/pyproject.toml`, delete the generated `[project.scripts]` table and append:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--strict-markers --import-mode=importlib"

[tool.ruff]
line-length = 100
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "S", "SIM", "RUF"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["S101", "S104", "S105", "S106"]

[tool.mypy]
strict = true
python_version = "3.13"
plugins = ["pydantic.mypy"]

[[tool.mypy.overrides]]
module = ["weasyprint.*", "num2words.*"]
ignore_missing_imports = true

[tool.coverage.run]
source = ["gerenciador"]
```

Create `.gitignore` at the repository root:

```gitignore
.DS_Store
.env
data/
__pycache__/
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.hypothesis/
.coverage
htmlcov/
node_modules/
dist/
```

- [ ] **Step 2: Write the failing test**

`backend/tests/domain/test_cpf.py`:

```python
import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

from gerenciador.domain.cpf import format_cpf, mask_cpf, normalize_cpf


def _reference_check_digit(digits: list[int]) -> int:
    total = 0
    weight = len(digits) + 1
    for digit in digits:
        total += digit * weight
        weight -= 1
    rest = total % 11
    return 0 if rest < 2 else 11 - rest


def _build_valid(base: list[int]) -> str:
    first = _reference_check_digit(base)
    second = _reference_check_digit([*base, first])
    return "".join(str(d) for d in [*base, first, second])


@pytest.mark.parametrize(
    ("raw", "digits"),
    [
        ("123.456.789-09", "12345678909"),
        ("12345678909", "12345678909"),
        (" 987.654.321-00 ", "98765432100"),
        ("111 444 777 35", "11144477735"),
    ],
)
def test_normalize_accepts_punctuated_and_bare(raw: str, digits: str) -> None:
    assert normalize_cpf(raw) == digits


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "123",
        "123.456.789-00",
        "111.111.111-11",
        "00000000000",
        "1234567890912",
        "abc12345678909",
        "123.456.789-09x",
        "123/456/789-09",
    ],
)
def test_normalize_rejects_invalid(raw: str) -> None:
    with pytest.raises(ValueError, match="CPF inválido"):
        normalize_cpf(raw)


@given(base=st.lists(st.integers(0, 9), min_size=9, max_size=9))
def test_generated_cpfs_are_accepted_and_a_wrong_last_digit_is_rejected(base: list[int]) -> None:
    cpf = _build_valid(base)
    assume(len(set(cpf)) > 1)
    assert normalize_cpf(cpf) == cpf
    assert normalize_cpf(format_cpf(cpf)) == cpf
    wrong_last = cpf[:10] + str((int(cpf[10]) + 1) % 10)
    with pytest.raises(ValueError, match="CPF inválido"):
        normalize_cpf(wrong_last)


def test_format_and_mask() -> None:
    assert format_cpf("12345678909") == "123.456.789-09"
    assert mask_cpf("12345678909") == "***.***.***-09"
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/domain/test_cpf.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.domain.cpf'`

- [ ] **Step 4: Write the implementation**

`backend/src/gerenciador/domain/cpf.py`:

```python
"""CPF validation and display."""

import re

_ALLOWED = re.compile(r"[\d.\-\s]*")
_NON_DIGITS = re.compile(r"\D")


def _check_digit(digits: str) -> int:
    weight = len(digits) + 1
    total = sum(int(digit) * (weight - index) for index, digit in enumerate(digits))
    remainder = (total * 10) % 11
    return 0 if remainder == 10 else remainder


def normalize_cpf(value: str) -> str:
    """Return the 11 digits of a valid CPF, or raise ValueError."""
    if not _ALLOWED.fullmatch(value):
        raise ValueError("CPF inválido")
    digits = _NON_DIGITS.sub("", value)
    if len(digits) != 11 or digits == digits[0] * 11:
        raise ValueError("CPF inválido")
    if _check_digit(digits[:9]) != int(digits[9]) or _check_digit(digits[:10]) != int(digits[10]):
        raise ValueError("CPF inválido")
    return digits


def format_cpf(digits: str) -> str:
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"


def mask_cpf(digits: str) -> str:
    return f"***.***.***-{digits[9:]}"
```

- [ ] **Step 5: Run the checks**

Run: `uv run pytest tests/domain/test_cpf.py -q && uv run ruff format . && uv run ruff check . && uv run mypy src`
Expected: all tests pass, no lint or type errors.

- [ ] **Step 6: Commit**

```bash
git add ../.gitignore . && git commit -m "feat: scaffold backend and add CPF rules"
```

---

### Task 2: Money formatting

**Files:**
- Create: `backend/src/gerenciador/domain/money.py`
- Test: `backend/tests/domain/test_money.py`

**Interfaces:**
- Produces: `format_brl(cents: int) -> str` (`"R$ 2.000,00"`), `amount_in_words(cents: int) -> str` (`"dois mil reais"`). Both raise `ValueError` for negative input.

- [ ] **Step 1: Write the failing test**

`backend/tests/domain/test_money.py`:

```python
from collections.abc import Callable

import pytest
from hypothesis import given
from hypothesis import strategies as st

from gerenciador.domain.money import amount_in_words, format_brl


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (0, "R$ 0,00"),
        (5, "R$ 0,05"),
        (50000, "R$ 500,00"),
        (120000, "R$ 1.200,00"),
        (200000, "R$ 2.000,00"),
        (123456789, "R$ 1.234.567,89"),
    ],
)
def test_format_brl(cents: int, expected: str) -> None:
    assert format_brl(cents) == expected


@given(cents=st.integers(0, 10**12))
def test_format_brl_round_trips(cents: int) -> None:
    text = format_brl(cents)
    assert text.startswith("R$ ")
    assert int(text[3:].replace(".", "").replace(",", "")) == cents


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (0, "zero reais"),
        (1, "um centavo"),
        (50, "cinquenta centavos"),
        (100, "um real"),
        (150, "um real e cinquenta centavos"),
        (120000, "mil e duzentos reais"),
        (200000, "dois mil reais"),
        (230050, "dois mil e trezentos reais e cinquenta centavos"),
        (100000000, "um milhão de reais"),
        (200000000, "dois milhões de reais"),
    ],
)
def test_amount_in_words(cents: int, expected: str) -> None:
    assert amount_in_words(cents) == expected


@pytest.mark.parametrize("function", [format_brl, amount_in_words])
def test_negative_amounts_are_rejected(function: Callable[[int], str]) -> None:
    with pytest.raises(ValueError, match="negative"):
        function(-1)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/domain/test_money.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

`backend/src/gerenciador/domain/money.py`:

```python
"""Brazilian real formatting. All amounts are integer centavos."""

from num2words import num2words


def _require_non_negative(cents: int) -> None:
    if cents < 0:
        raise ValueError("amount cannot be negative")


def format_brl(cents: int) -> str:
    _require_non_negative(cents)
    reais, centavos = divmod(cents, 100)
    grouped = f"{reais:,}".replace(",", ".")
    return f"R$ {grouped},{centavos:02d}"


def _cardinal(number: int) -> str:
    return str(num2words(number, lang="pt_BR"))


def _reais_in_words(reais: int) -> str:
    if reais == 1:
        return "um real"
    connector = " de" if reais >= 1_000_000 and reais % 1_000_000 == 0 else ""
    return f"{_cardinal(reais)}{connector} reais"


def amount_in_words(cents: int) -> str:
    _require_non_negative(cents)
    reais, centavos = divmod(cents, 100)
    parts: list[str] = []
    if reais or not centavos:
        parts.append(_reais_in_words(reais))
    if centavos:
        parts.append(f"{_cardinal(centavos)} {'centavo' if centavos == 1 else 'centavos'}")
    return " e ".join(parts)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/domain/test_money.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS. If `num2words` words a cardinal differently from an expected string, stop and report the difference; do not change the expected strings, since they are the wording the contract must print.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add BRL formatting and amount in words"
```

---

### Task 3: Contract rules and wording

**Files:**
- Create: `backend/src/gerenciador/domain/contract.py`
- Test: `backend/tests/domain/test_contract_rules.py`

**Interfaces:**
- Produces:
  - `TO_BE_DEFINED: str` = `"A definir"`
  - `class ContractRuleError(ValueError)` with attributes `field: str`, `message: str`; constructor `ContractRuleError(field, message)`
  - `compute_total_cents(item_amounts: Sequence[int], discount_cents: int | None) -> int`
  - `format_long_date(value: date) -> str`, `format_time(value: time | None) -> str`, `format_hours(hours: int | None) -> str`, `text_or_to_be_defined(value: str | None) -> str`
  - `photographer_count_text(count: int) -> str`, `photographers_phrase(count: int) -> str`

- [ ] **Step 1: Write the failing test**

`backend/tests/domain/test_contract_rules.py`:

```python
import datetime as dt

import pytest

from gerenciador.domain.contract import (
    TO_BE_DEFINED,
    ContractRuleError,
    compute_total_cents,
    format_hours,
    format_long_date,
    format_time,
    photographer_count_text,
    photographers_phrase,
    text_or_to_be_defined,
)


def test_total_is_items_minus_discount() -> None:
    assert compute_total_cents([50000, 120000, 60000], 30000) == 200000
    assert compute_total_cents([120000], None) == 120000


@pytest.mark.parametrize(
    ("items", "discount", "field"),
    [
        ([], None, "payment.items"),
        ([0], None, "payment.items"),
        ([100, -5], None, "payment.items"),
        ([1000], 0, "payment.pix_discount_cents"),
        ([1000], 1000, "payment.pix_discount_cents"),
        ([1000], 2000, "payment.pix_discount_cents"),
    ],
)
def test_total_rules(items: list[int], discount: int | None, field: str) -> None:
    with pytest.raises(ContractRuleError) as error:
        compute_total_cents(items, discount)
    assert error.value.field == field
    assert error.value.message


def test_dates_times_and_hours() -> None:
    assert format_long_date(dt.date(2027, 3, 14)) == "14 de março de 2027"
    assert format_long_date(dt.date(2026, 12, 1)) == "1 de dezembro de 2026"
    assert format_time(dt.time(16, 0)) == "16:00"
    assert format_time(None) == TO_BE_DEFINED
    assert format_hours(1) == "1 hora"
    assert format_hours(6) == "6 horas"
    assert format_hours(None) == TO_BE_DEFINED


def test_text_or_to_be_defined() -> None:
    assert text_or_to_be_defined("Rua A") == "Rua A"
    assert text_or_to_be_defined(None) == "A definir"


def test_photographer_wording() -> None:
    assert photographer_count_text(2) == "2 (dois)"
    assert photographers_phrase(2) == "2 (dois) fotógrafos"
    assert photographers_phrase(1) == "1 (um) fotógrafo"
    assert photographers_phrase(10) == "10 (dez) fotógrafos"


@pytest.mark.parametrize("count", [0, 11])
def test_photographer_count_out_of_range(count: int) -> None:
    with pytest.raises(ValueError, match="between 1 and 10"):
        photographer_count_text(count)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/domain/test_contract_rules.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

`backend/src/gerenciador/domain/contract.py`:

```python
"""Contract rules and the wording of values printed in the contract."""

import datetime as dt
from collections.abc import Sequence

TO_BE_DEFINED = "A definir"

_MONTHS = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)
_NUMBER_WORDS = ("um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez")


class ContractRuleError(ValueError):
    """A contract broke a business rule. `field` is the request field at fault."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def compute_total_cents(item_amounts: Sequence[int], discount_cents: int | None) -> int:
    if not item_amounts:
        raise ContractRuleError("payment.items", "informe ao menos um item")
    if any(amount <= 0 for amount in item_amounts):
        raise ContractRuleError("payment.items", "o valor de cada item deve ser maior que zero")
    subtotal = sum(item_amounts)
    if discount_cents is None:
        return subtotal
    if discount_cents <= 0 or discount_cents >= subtotal:
        raise ContractRuleError(
            "payment.pix_discount_cents",
            "o desconto deve ser maior que zero e menor que a soma dos itens",
        )
    return subtotal - discount_cents


def format_long_date(value: dt.date) -> str:
    return f"{value.day} de {_MONTHS[value.month - 1]} de {value.year}"


def format_time(value: dt.time | None) -> str:
    return TO_BE_DEFINED if value is None else value.strftime("%H:%M")


def format_hours(hours: int | None) -> str:
    if hours is None:
        return TO_BE_DEFINED
    return "1 hora" if hours == 1 else f"{hours} horas"


def text_or_to_be_defined(value: str | None) -> str:
    return TO_BE_DEFINED if value is None else value


def photographer_count_text(count: int) -> str:
    if not 1 <= count <= len(_NUMBER_WORDS):
        raise ValueError("photographer count must be between 1 and 10")
    return f"{count} ({_NUMBER_WORDS[count - 1]})"


def photographers_phrase(count: int) -> str:
    noun = "fotógrafo" if count == 1 else "fotógrafos"
    return f"{photographer_count_text(count)} {noun}"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/domain -q --cov=gerenciador.domain --cov-report=term-missing --cov-fail-under=100 && uv run ruff check . && uv run mypy src`
Expected: PASS with 100% coverage on `gerenciador/domain`.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add contract rules and wording"
```

---

### Task 4: Settings and key generation

**Files:**
- Create: `backend/src/gerenciador/config.py`, `backend/src/gerenciador/keygen.py`, `.env.example`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Consumes: `normalize_cpf` from Task 1.
- Produces:
  - `REPO_ROOT: Path` (the repository root)
  - `generate_key() -> str` (urlsafe base64 of 32 random bytes)
  - `class Settings(BaseSettings)` with fields `contractor_name: str`, `contractor_cpf: str` (stored as 11 digits), `contractor_address: str`, `contractor_representative: str`, `field_encryption_key: SecretStr`, `cpf_lookup_key: SecretStr`, `database_path: Path`, `template_path: Path`, `frontend_dist: Path`, `host: str`, `port: int`; methods `encryption_key_bytes() -> bytes`, `lookup_key_bytes() -> bytes`
  - `get_settings() -> Settings` (cached)
  - pytest fixture `settings` (a `Settings` using a temporary database path)

- [ ] **Step 1: Write the failing test**

`backend/tests/conftest.py`:

```python
from pathlib import Path

import pytest

from gerenciador.config import Settings, generate_key


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        contractor_name="Fotografia Teste",
        contractor_cpf="111.444.777-35",
        contractor_address="Rua Exemplo 1 - Centro",
        contractor_representative="Pessoa Teste",
        field_encryption_key=generate_key(),
        cpf_lookup_key=generate_key(),
        database_path=tmp_path / "data" / "test.db",
        frontend_dist=tmp_path / "no-frontend",
        host="127.0.0.1",
        port=8000,
    )
```

`backend/tests/test_config.py`:

```python
import base64
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from gerenciador.config import REPO_ROOT, Settings, generate_key


def _kwargs(tmp_path: Path, **overrides: Any) -> dict[str, Any]:
    values: dict[str, Any] = {
        "_env_file": None,
        "contractor_name": "Fotografia Teste",
        "contractor_cpf": "111.444.777-35",
        "contractor_address": "Rua Exemplo 1",
        "contractor_representative": "Pessoa Teste",
        "field_encryption_key": generate_key(),
        "cpf_lookup_key": generate_key(),
        "database_path": tmp_path / "test.db",
        "host": "127.0.0.1",
        "port": 8000,
    }
    values.update(overrides)
    return values


def test_valid_settings(settings: Settings) -> None:
    assert settings.contractor_cpf == "11144477735"
    assert settings.host == "127.0.0.1"
    assert len(settings.encryption_key_bytes()) == 32
    assert len(settings.lookup_key_bytes()) == 32
    assert settings.template_path == REPO_ROOT / "base_contract" / "contract_template.md"


def test_generate_key_is_32_random_bytes() -> None:
    first, second = generate_key(), generate_key()
    assert len(base64.urlsafe_b64decode(first)) == 32
    assert first != second


@pytest.mark.parametrize("key", ["", "short", base64.urlsafe_b64encode(b"x" * 16).decode()])
def test_rejects_malformed_keys(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValidationError):
        Settings(**_kwargs(tmp_path, field_encryption_key=key))


def test_rejects_identical_keys(tmp_path: Path) -> None:
    key = generate_key()
    with pytest.raises(ValidationError, match="must differ"):
        Settings(**_kwargs(tmp_path, field_encryption_key=key, cpf_lookup_key=key))


def test_rejects_invalid_contractor_cpf(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        Settings(**_kwargs(tmp_path, contractor_cpf="123.456.789-00"))


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.0.10", "example.com", "::"])
def test_refuses_to_bind_outside_loopback(tmp_path: Path, host: str) -> None:
    with pytest.raises(ValidationError, match="no authentication"):
        Settings(**_kwargs(tmp_path, host=host))


def test_validation_errors_do_not_reveal_keys(tmp_path: Path) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(**_kwargs(tmp_path, field_encryption_key="my-secret-value"))
    assert "my-secret-value" not in str(error.value)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_config.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.config'`

- [ ] **Step 3: Write the implementation**

`backend/src/gerenciador/config.py`:

```python
"""Application settings, read from the repository's .env file."""

import base64
import os
from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from gerenciador.domain.cpf import normalize_cpf

REPO_ROOT = Path(__file__).resolve().parents[3]
_KEY_BYTES = 32
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})


def generate_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(_KEY_BYTES)).decode("ascii")


def _decode_key(value: SecretStr) -> bytes:
    return base64.urlsafe_b64decode(value.get_secret_value())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    contractor_name: str
    contractor_cpf: str
    contractor_address: str
    contractor_representative: str
    field_encryption_key: SecretStr
    cpf_lookup_key: SecretStr
    database_path: Path = REPO_ROOT / "data" / "gerenciador.db"
    template_path: Path = REPO_ROOT / "base_contract" / "contract_template.md"
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"
    host: str = "127.0.0.1"
    port: int = 8000

    @field_validator("contractor_cpf")
    @classmethod
    def _contractor_cpf_is_valid(cls, value: str) -> str:
        return normalize_cpf(value)

    @field_validator("field_encryption_key", "cpf_lookup_key")
    @classmethod
    def _key_is_32_bytes(cls, value: SecretStr) -> SecretStr:
        try:
            raw = _decode_key(value)
        except ValueError as exc:
            raise ValueError("must be urlsafe base64") from exc
        if len(raw) != _KEY_BYTES:
            raise ValueError("must decode to exactly 32 bytes")
        return value

    @field_validator("host")
    @classmethod
    def _host_is_loopback(cls, value: str) -> str:
        if value not in _LOOPBACK_HOSTS:
            raise ValueError(
                "refusing to bind outside loopback: this version has no authentication"
            )
        return value

    @model_validator(mode="after")
    def _keys_differ(self) -> Self:
        if (
            self.field_encryption_key.get_secret_value()
            == self.cpf_lookup_key.get_secret_value()
        ):
            raise ValueError("field_encryption_key and cpf_lookup_key must differ")
        return self

    def encryption_key_bytes(self) -> bytes:
        return _decode_key(self.field_encryption_key)

    def lookup_key_bytes(self) -> bytes:
        return _decode_key(self.cpf_lookup_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`backend/src/gerenciador/keygen.py`:

```python
"""Print fresh keys for .env: `uv run python -m gerenciador.keygen`."""

from gerenciador.config import generate_key


def main() -> None:
    print(f"FIELD_ENCRYPTION_KEY={generate_key()}")
    print(f"CPF_LOOKUP_KEY={generate_key()}")


if __name__ == "__main__":
    main()
```

`.env.example` at the repository root:

```dotenv
# Copy to .env and fill in. Never commit .env.
CONTRACTOR_NAME=Seu Nome Completo
CONTRACTOR_CPF=000.000.000-00
CONTRACTOR_ADDRESS=Rua Exemplo 123 - Bairro
CONTRACTOR_REPRESENTATIVE=Seu Nome

# Generate both with: cd backend && uv run python -m gerenciador.keygen
# Back these up separately from the database. Losing them loses every CPF and address.
FIELD_ENCRYPTION_KEY=
CPF_LOOKUP_KEY=
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_config.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ../.env.example . && git commit -m "feat: add settings with key and loopback validation"
```

---

### Task 5: Field encryption

**Files:**
- Create: `backend/src/gerenciador/services/__init__.py` (empty), `backend/src/gerenciador/services/crypto.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/services/test_crypto.py`

**Interfaces:**
- Consumes: `Settings.encryption_key_bytes()`, `Settings.lookup_key_bytes()` from Task 4.
- Produces:
  - `class DecryptionError(Exception)`
  - `field_context(table: str, column: str, row_id: str) -> str`
  - `class FieldCipher`: `FieldCipher(encryption_key: bytes, lookup_key: bytes)`, `FieldCipher.from_settings(settings: Settings) -> FieldCipher`, `encrypt(plaintext: str, *, context: str) -> str`, `decrypt(token: str, *, context: str) -> str`, `cpf_lookup(cpf_digits: str) -> str`
  - pytest fixture `cipher`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/conftest.py`:

```python
from gerenciador.services.crypto import FieldCipher


@pytest.fixture
def cipher(settings: Settings) -> FieldCipher:
    return FieldCipher.from_settings(settings)
```

`backend/tests/services/test_crypto.py`:

```python
import os

import pytest

from gerenciador.services.crypto import DecryptionError, FieldCipher, field_context

CONTEXT = field_context("clients", "cpf_encrypted", "row-1")


def test_round_trip(cipher: FieldCipher) -> None:
    token = cipher.encrypt("12345678909", context=CONTEXT)
    assert token.startswith("v1:")
    assert "12345678909" not in token
    assert cipher.decrypt(token, context=CONTEXT) == "12345678909"


def test_round_trip_non_ascii(cipher: FieldCipher) -> None:
    address = "Rua São João 10 - Água Verde"
    assert cipher.decrypt(cipher.encrypt(address, context=CONTEXT), context=CONTEXT) == address


def test_same_plaintext_encrypts_differently(cipher: FieldCipher) -> None:
    assert cipher.encrypt("x", context=CONTEXT) != cipher.encrypt("x", context=CONTEXT)


def test_wrong_key_fails(cipher: FieldCipher) -> None:
    token = cipher.encrypt("secret", context=CONTEXT)
    other = FieldCipher(os.urandom(32), os.urandom(32))
    with pytest.raises(DecryptionError):
        other.decrypt(token, context=CONTEXT)


def test_wrong_context_fails(cipher: FieldCipher) -> None:
    token = cipher.encrypt("secret", context=CONTEXT)
    with pytest.raises(DecryptionError):
        cipher.decrypt(token, context=field_context("clients", "cpf_encrypted", "row-2"))


@pytest.mark.parametrize("token", ["", "v1:", "v1:not-base64!", "v2:AAAA", "garbage"])
def test_malformed_tokens_fail(cipher: FieldCipher, token: str) -> None:
    with pytest.raises(DecryptionError):
        cipher.decrypt(token, context=CONTEXT)


def test_tampered_token_fails(cipher: FieldCipher) -> None:
    token = cipher.encrypt("secret", context=CONTEXT)
    flipped = token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1]
    with pytest.raises(DecryptionError):
        cipher.decrypt(flipped, context=CONTEXT)


def test_cpf_lookup_is_deterministic_and_keyed(cipher: FieldCipher) -> None:
    lookup = cipher.cpf_lookup("12345678909")
    assert lookup == cipher.cpf_lookup("12345678909")
    assert lookup != cipher.cpf_lookup("98765432100")
    assert len(lookup) == 64
    assert "12345678909" not in lookup
    assert FieldCipher(os.urandom(32), os.urandom(32)).cpf_lookup("12345678909") != lookup
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/services/test_crypto.py -q`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the implementation**

`backend/src/gerenciador/services/crypto.py`:

```python
"""Field-level encryption for personal data at rest."""

import base64
import hashlib
import hmac
import os
from typing import Self

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from gerenciador.config import Settings

_VERSION = "v1"
_NONCE_BYTES = 12


class DecryptionError(Exception):
    """A stored value could not be decrypted."""


def field_context(table: str, column: str, row_id: str) -> str:
    """Associated data binding a ciphertext to one column of one row."""
    return f"{table}.{column}:{row_id}"


class FieldCipher:
    def __init__(self, encryption_key: bytes, lookup_key: bytes) -> None:
        self._aead = AESGCM(encryption_key)
        self._lookup_key = lookup_key

    @classmethod
    def from_settings(cls, settings: Settings) -> Self:
        return cls(settings.encryption_key_bytes(), settings.lookup_key_bytes())

    def encrypt(self, plaintext: str, *, context: str) -> str:
        nonce = os.urandom(_NONCE_BYTES)
        sealed = self._aead.encrypt(nonce, plaintext.encode("utf-8"), context.encode("utf-8"))
        return f"{_VERSION}:{base64.urlsafe_b64encode(nonce + sealed).decode('ascii')}"

    def decrypt(self, token: str, *, context: str) -> str:
        version, _, payload = token.partition(":")
        if version != _VERSION:
            raise DecryptionError("unknown key version")
        try:
            raw = base64.urlsafe_b64decode(payload)
            plaintext = self._aead.decrypt(
                raw[:_NONCE_BYTES], raw[_NONCE_BYTES:], context.encode("utf-8")
            )
        except (InvalidTag, ValueError) as exc:
            raise DecryptionError("could not decrypt field") from exc
        return plaintext.decode("utf-8")

    def cpf_lookup(self, cpf_digits: str) -> str:
        return hmac.new(self._lookup_key, cpf_digits.encode("ascii"), hashlib.sha256).hexdigest()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/services/test_crypto.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add AES-256-GCM field cipher and CPF lookup hash"
```

---

### Task 6: Database, migrations and the audit trail

**Files:**
- Create: `backend/src/gerenciador/clock.py`
- Create: `backend/src/gerenciador/db/__init__.py` (empty), `backend/src/gerenciador/db/models.py`, `backend/src/gerenciador/db/session.py`, `backend/src/gerenciador/db/migrate.py`
- Create: `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/versions/0001_initial_schema.py`
- Create: `backend/src/gerenciador/services/context.py`, `backend/src/gerenciador/services/exceptions.py`, `backend/src/gerenciador/services/pagination.py`, `backend/src/gerenciador/services/audit_service.py`
- Create: `backend/src/gerenciador/repositories/__init__.py` (empty), `backend/src/gerenciador/repositories/audit_repository.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/db/test_database.py`, `backend/tests/services/test_audit_service.py`

**Interfaces:**
- Produces:
  - `utcnow() -> datetime` (timezone-aware UTC)
  - Models `Base`, `Client`, `Contract`, `ContractItem`, `AuditEvent` with the columns shown in Step 3
  - `database_url(path: Path) -> str`, `prepare_database_file(path: Path) -> None`, `create_db_engine(path: Path) -> Engine`, `create_session_factory(engine: Engine) -> sessionmaker[Session]`
  - `run_migrations(url: str) -> None`, `init_database(path: Path) -> Engine`
  - `@dataclass(frozen=True) class RequestContext` with `actor: str`, `request_id: str`
  - Exceptions `NotFoundError(entity: str, entity_id: str)`, `ConflictError(message: str)`, `StaleVersionError()`, `InvalidCursorError()`
  - `@dataclass(frozen=True) class Page[T]` with `items: list[T]`, `next_cursor: str | None`; `encode_cursor(created_at: datetime, row_id: str) -> str`; `decode_cursor(cursor: str) -> tuple[datetime, str]` (raises `InvalidCursorError`)
  - `class AuditService`: `AuditService(session: Session)`, `record(ctx: RequestContext, action: str, *, entity_type: str | None = None, entity_id: str | None = None, outcome: str = "success", details: dict[str, Any] | None = None) -> AuditEvent` (adds and flushes, does not commit), `get(event_id: int) -> AuditEvent` (raises `NotFoundError`), `list_page(*, limit: int, cursor: str | None, action: str | None = None, entity_id: str | None = None, occurred_from: datetime | None = None, occurred_to: datetime | None = None) -> Page[AuditEvent]`
  - pytest fixtures `engine`, `session`, `ctx`, `audit`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/conftest.py`:

```python
from collections.abc import Iterator

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from gerenciador.db.migrate import init_database
from gerenciador.db.session import create_session_factory
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext


@pytest.fixture
def engine(settings: Settings) -> Iterator[Engine]:
    db_engine = init_database(settings.database_path)
    yield db_engine
    db_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with create_session_factory(engine)() as db_session:
        yield db_session


@pytest.fixture
def ctx() -> RequestContext:
    return RequestContext(actor="owner", request_id="test-request")


@pytest.fixture
def audit(session: Session) -> AuditService:
    return AuditService(session)
```

`backend/tests/db/test_database.py`:

```python
import datetime as dt
import stat
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.config import Settings
from gerenciador.db.migrate import init_database
from gerenciador.db.models import AuditEvent, Base, Client


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_migrations_create_all_tables(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names())
    assert {"clients", "contracts", "contract_items", "audit_events"} <= tables


def test_models_match_migrations(engine: Engine) -> None:
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": False})
        assert compare_metadata(context, Base.metadata) == []


def test_database_file_is_owner_only(engine: Engine, settings: Settings) -> None:
    assert _mode(settings.database_path) == 0o600
    assert _mode(settings.database_path.parent) == 0o700


def test_existing_loose_permissions_are_tightened(tmp_path: Path) -> None:
    path = tmp_path / "existing.db"
    path.touch(mode=0o644)
    init_database(path).dispose()
    assert _mode(path) == 0o600


def test_utcnow_is_timezone_aware() -> None:
    assert utcnow().tzinfo is dt.UTC


def test_timestamps_round_trip_as_utc(session: Session) -> None:
    now = utcnow()
    session.add(Client(id="c1", full_name="A", created_at=now, updated_at=now))
    session.commit()
    session.expire_all()
    loaded = session.get(Client, "c1")
    assert loaded is not None
    assert loaded.created_at == now
    assert loaded.created_at.tzinfo is dt.UTC


def test_naive_datetimes_are_rejected(session: Session) -> None:
    naive = dt.datetime(2026, 1, 1)
    session.add(Client(id="c2", full_name="A", created_at=naive, updated_at=naive))
    with pytest.raises(Exception, match="naive"):
        session.flush()


def test_foreign_keys_are_enforced(session: Session) -> None:
    with pytest.raises(DBAPIError):
        session.execute(
            text(
                "INSERT INTO contract_items (id, contract_id, position, description, amount_cents)"
                " VALUES ('i1', 'missing', 0, 'x', 100)"
            )
        )


def _add_event(session: Session) -> int:
    event = AuditEvent(
        occurred_at=utcnow(),
        actor="owner",
        action="contract.created",
        outcome="success",
        request_id="r1",
        details={},
    )
    session.add(event)
    session.commit()
    return event.id


def test_audit_events_cannot_be_updated(session: Session) -> None:
    event_id = _add_event(session)
    with pytest.raises(DBAPIError, match="append-only"):
        session.execute(
            text("UPDATE audit_events SET actor = 'x' WHERE id = :id"), {"id": event_id}
        )


def test_audit_events_cannot_be_deleted(session: Session) -> None:
    event_id = _add_event(session)
    with pytest.raises(DBAPIError, match="append-only"):
        session.execute(text("DELETE FROM audit_events WHERE id = :id"), {"id": event_id})
```

`backend/tests/services/test_audit_service.py`:

```python
import datetime as dt

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import InvalidCursorError, NotFoundError
from gerenciador.services.pagination import decode_cursor, encode_cursor


def _count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(AuditEvent)) or 0


def test_record_stores_the_event(session: Session, audit: AuditService, ctx: RequestContext) -> None:
    event = audit.record(
        ctx, "contract.created", entity_type="contract", entity_id="abc", details={"version": 1}
    )
    session.commit()
    stored = audit.get(event.id)
    assert stored.actor == "owner"
    assert stored.action == "contract.created"
    assert stored.entity_type == "contract"
    assert stored.entity_id == "abc"
    assert stored.outcome == "success"
    assert stored.request_id == "test-request"
    assert stored.details == {"version": 1}
    assert stored.occurred_at.tzinfo is dt.UTC


def test_record_does_not_commit(session: Session, audit: AuditService, ctx: RequestContext) -> None:
    audit.record(ctx, "contract.created")
    session.rollback()
    assert _count(session) == 0


def test_get_missing_event(audit: AuditService) -> None:
    with pytest.raises(NotFoundError):
        audit.get(999)


def test_list_page_is_newest_first_and_paginates(
    session: Session, audit: AuditService, ctx: RequestContext
) -> None:
    for index in range(5):
        audit.record(ctx, "contract.created", entity_id=f"e{index}")
    session.commit()

    first = audit.list_page(limit=2, cursor=None)
    assert [event.entity_id for event in first.items] == ["e4", "e3"]
    assert first.next_cursor is not None

    second = audit.list_page(limit=2, cursor=first.next_cursor)
    assert [event.entity_id for event in second.items] == ["e2", "e1"]

    third = audit.list_page(limit=2, cursor=second.next_cursor)
    assert [event.entity_id for event in third.items] == ["e0"]
    assert third.next_cursor is None


def test_list_page_filters(session: Session, audit: AuditService, ctx: RequestContext) -> None:
    audit.record(ctx, "contract.created", entity_id="a")
    audit.record(ctx, "contract.deleted", entity_id="a")
    audit.record(ctx, "contract.created", entity_id="b")
    session.commit()

    by_action = audit.list_page(limit=10, cursor=None, action="contract.created")
    assert [event.entity_id for event in by_action.items] == ["b", "a"]

    by_entity = audit.list_page(limit=10, cursor=None, entity_id="a")
    assert [event.action for event in by_entity.items] == ["contract.deleted", "contract.created"]

    future = dt.datetime.now(dt.UTC) + dt.timedelta(days=1)
    assert audit.list_page(limit=10, cursor=None, occurred_from=future).items == []
    assert len(audit.list_page(limit=10, cursor=None, occurred_to=future).items) == 3


@pytest.mark.parametrize("cursor", ["abc", "1.5", "-", ""])
def test_audit_rejects_malformed_cursor(audit: AuditService, cursor: str) -> None:
    with pytest.raises(InvalidCursorError):
        audit.list_page(limit=10, cursor=cursor)


def test_cursor_round_trip() -> None:
    moment = dt.datetime(2026, 10, 13, 12, 30, 15, 123456, tzinfo=dt.UTC)
    assert decode_cursor(encode_cursor(moment, "row-id")) == (moment, "row-id")


@pytest.mark.parametrize("cursor", ["garbage", "!!!", "YWJj", "MjAyNi0xMC0xM1QxMjowMDowMHxpZA=="])
def test_decode_rejects_malformed_cursor(cursor: str) -> None:
    with pytest.raises(InvalidCursorError):
        decode_cursor(cursor)
```

The last parametrised value is base64 for `2026-10-13T12:00:00|id`: a well-formed cursor whose timestamp has no time zone, which must be rejected.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/db tests/services/test_audit_service.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.db'`

- [ ] **Step 3: Write the models, session and small shared modules**

`backend/src/gerenciador/clock.py`:

```python
import datetime as dt


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)
```

`backend/src/gerenciador/db/models.py`:

```python
"""SQLAlchemy models. Personal data lives only in `clients`."""

import datetime as dt
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[dt.datetime]):
    """Stores UTC, returns timezone-aware datetimes, refuses naive ones."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(
        self, value: dt.datetime | None, dialect: Dialect
    ) -> dt.datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetimes are not allowed")
        return value.astimezone(dt.UTC).replace(tzinfo=None)

    def process_result_value(
        self, value: dt.datetime | None, dialect: Dialect
    ) -> dt.datetime | None:
        return None if value is None else value.replace(tzinfo=dt.UTC)


class Base(DeclarativeBase):
    pass


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    full_name: Mapped[str | None] = mapped_column(String(200))
    cpf_encrypted: Mapped[str | None] = mapped_column(Text)
    cpf_lookup: Mapped[str | None] = mapped_column(String(64), unique=True)
    address_encrypted: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    anonymised_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)


class Contract(Base):
    __tablename__ = "contracts"
    __table_args__ = (CheckConstraint("groom_id <> bride_id", name="ck_contracts_distinct_clients"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    groom_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    bride_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    event_date: Mapped[dt.date]
    venue_name: Mapped[str] = mapped_column(String(200))
    venue_address: Mapped[str | None] = mapped_column(String(300))
    coverage_start: Mapped[dt.time | None]
    coverage_end: Mapped[dt.time | None]
    hours_contracted: Mapped[int | None]
    photographer_count: Mapped[int]
    pix_discount_cents: Mapped[int | None]
    signing_city: Mapped[str] = mapped_column(String(100))
    signing_date: Mapped[dt.date]
    version: Mapped[int]
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    deleted_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)

    groom: Mapped[Client] = relationship(foreign_keys=[groom_id], lazy="joined")
    bride: Mapped[Client] = relationship(foreign_keys=[bride_id], lazy="joined")
    items: Mapped[list["ContractItem"]] = relationship(
        order_by="ContractItem.position", cascade="all, delete-orphan", lazy="selectin"
    )


class ContractItem(Base):
    __tablename__ = "contract_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("contracts.id"))
    position: Mapped[int]
    description: Mapped[str] = mapped_column(String(200))
    amount_cents: Mapped[int]


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    occurred_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[str | None] = mapped_column(String(36))
    outcome: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[str] = mapped_column(String(36))
    details: Mapped[dict[str, Any]] = mapped_column(JSON)
```

`backend/src/gerenciador/db/session.py`:

```python
"""Engine and session factory for the SQLite database."""

from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def database_url(path: Path) -> str:
    return f"sqlite:///{path}"


def prepare_database_file(path: Path) -> None:
    """Create the database file and its folder readable by the owner only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)


def create_db_engine(path: Path) -> Engine:
    # hide_parameters keeps personal data out of SQL logs and error messages.
    engine = create_engine(
        database_url(path), connect_args={"check_same_thread": False}, hide_parameters=True
    )

    @event.listens_for(engine, "connect")
    def _configure(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # Overwrite freed content with zeros, so anonymised data leaves the file.
        cursor.execute("PRAGMA secure_delete=ON")
        cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)
```

`backend/src/gerenciador/db/migrate.py`:

```python
"""Apply Alembic migrations from code."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine

from gerenciador.db.session import create_db_engine, database_url, prepare_database_file

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"


def run_migrations(url: str) -> None:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


def init_database(path: Path) -> Engine:
    prepare_database_file(path)
    run_migrations(database_url(path))
    return create_db_engine(path)
```

`backend/src/gerenciador/services/context.py`:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class RequestContext:
    """Who is acting and under which request. Recorded on every audit event."""

    actor: str
    request_id: str
```

`backend/src/gerenciador/services/exceptions.py`:

```python
"""Errors services raise. The API layer maps each to an HTTP status."""


class NotFoundError(Exception):
    def __init__(self, entity: str, entity_id: str) -> None:
        super().__init__(f"{entity} not found")
        self.entity = entity
        self.entity_id = entity_id


class ConflictError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class StaleVersionError(Exception):
    """The caller's version of a contract is not the current one."""


class InvalidCursorError(Exception):
    """A pagination cursor could not be decoded."""
```

`backend/src/gerenciador/services/pagination.py`:

```python
"""Cursor pagination shared by list operations."""

import base64
import datetime as dt
from dataclasses import dataclass

from gerenciador.services.exceptions import InvalidCursorError


@dataclass(frozen=True)
class Page[T]:
    items: list[T]
    next_cursor: str | None


def encode_cursor(created_at: dt.datetime, row_id: str) -> str:
    raw = f"{created_at.isoformat()}|{row_id}".encode()
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_cursor(cursor: str) -> tuple[dt.datetime, str]:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        timestamp, _, row_id = decoded.partition("|")
        created_at = dt.datetime.fromisoformat(timestamp)
    except ValueError as exc:
        raise InvalidCursorError from exc
    if not row_id or created_at.tzinfo is None:
        raise InvalidCursorError
    return created_at, row_id
```

- [ ] **Step 4: Write the migration**

Run: `uv run alembic init migrations`

In the generated `backend/alembic.ini`, set the URL line to empty: `sqlalchemy.url =`

Replace the generated `backend/migrations/env.py` with:

```python
from alembic import context
from sqlalchemy import create_engine

from gerenciador.db.models import Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    from gerenciador.config import get_settings
    from gerenciador.db.session import database_url

    return database_url(get_settings().database_path)


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations_online()
```

Create `backend/migrations/versions/0001_initial_schema.py`:

```python
"""initial schema

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_APPEND_ONLY = "SELECT RAISE(ABORT, 'audit_events is append-only');"


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("cpf_encrypted", sa.Text, nullable=True),
        sa.Column("cpf_lookup", sa.String(64), nullable=True, unique=True),
        sa.Column("address_encrypted", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("anonymised_at", sa.DateTime, nullable=True),
    )
    op.create_table(
        "contracts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("groom_id", sa.String(36), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("bride_id", sa.String(36), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("event_date", sa.Date, nullable=False),
        sa.Column("venue_name", sa.String(200), nullable=False),
        sa.Column("venue_address", sa.String(300), nullable=True),
        sa.Column("coverage_start", sa.Time, nullable=True),
        sa.Column("coverage_end", sa.Time, nullable=True),
        sa.Column("hours_contracted", sa.Integer, nullable=True),
        sa.Column("photographer_count", sa.Integer, nullable=False),
        sa.Column("pix_discount_cents", sa.Integer, nullable=True),
        sa.Column("signing_city", sa.String(100), nullable=False),
        sa.Column("signing_date", sa.Date, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.CheckConstraint("groom_id <> bride_id", name="ck_contracts_distinct_clients"),
    )
    op.create_table(
        "contract_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("contract_id", sa.String(36), sa.ForeignKey("contracts.id"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("occurred_at", sa.DateTime, nullable=False),
        sa.Column("actor", sa.String(100), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("details", sa.JSON, nullable=False),
    )
    op.execute(
        f"CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events "
        f"BEGIN {_APPEND_ONLY} END;"
    )
    op.execute(
        f"CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events "
        f"BEGIN {_APPEND_ONLY} END;"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER audit_events_no_delete")
    op.execute("DROP TRIGGER audit_events_no_update")
    op.drop_table("audit_events")
    op.drop_table("contract_items")
    op.drop_table("contracts")
    op.drop_table("clients")
```

- [ ] **Step 5: Write the audit repository and service**

`backend/src/gerenciador/repositories/audit_repository.py`:

```python
"""The only code that reads or writes audit_events. It never updates or deletes."""

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent


class AuditRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, event: AuditEvent) -> None:
        self._session.add(event)
        self._session.flush()

    def get(self, event_id: int) -> AuditEvent | None:
        return self._session.get(AuditEvent, event_id)

    def find_page(
        self,
        *,
        limit: int,
        before_id: int | None,
        action: str | None,
        entity_id: str | None,
        occurred_from: dt.datetime | None,
        occurred_to: dt.datetime | None,
    ) -> list[AuditEvent]:
        stmt = select(AuditEvent)
        if before_id is not None:
            stmt = stmt.where(AuditEvent.id < before_id)
        if action is not None:
            stmt = stmt.where(AuditEvent.action == action)
        if entity_id is not None:
            stmt = stmt.where(AuditEvent.entity_id == entity_id)
        if occurred_from is not None:
            stmt = stmt.where(AuditEvent.occurred_at >= occurred_from)
        if occurred_to is not None:
            stmt = stmt.where(AuditEvent.occurred_at <= occurred_to)
        return list(self._session.scalars(stmt.order_by(AuditEvent.id.desc()).limit(limit)))
```

`backend/src/gerenciador/services/audit_service.py`:

```python
"""Records one audit event per action, inside the caller's transaction."""

import datetime as dt
from typing import Any

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import AuditEvent
from gerenciador.repositories.audit_repository import AuditRepository
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import InvalidCursorError, NotFoundError
from gerenciador.services.pagination import Page


class AuditService:
    def __init__(self, session: Session) -> None:
        self._repo = AuditRepository(session)

    def record(
        self,
        ctx: RequestContext,
        action: str,
        *,
        entity_type: str | None = None,
        entity_id: str | None = None,
        outcome: str = "success",
        details: dict[str, Any] | None = None,
    ) -> AuditEvent:
        """Add the event to the current transaction. The caller commits.

        `details` must never contain personal values.
        """
        event = AuditEvent(
            occurred_at=utcnow(),
            actor=ctx.actor,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            outcome=outcome,
            request_id=ctx.request_id,
            details=details or {},
        )
        self._repo.add(event)
        return event

    def get(self, event_id: int) -> AuditEvent:
        event = self._repo.get(event_id)
        if event is None:
            raise NotFoundError("audit event", str(event_id))
        return event

    def list_page(
        self,
        *,
        limit: int,
        cursor: str | None,
        action: str | None = None,
        entity_id: str | None = None,
        occurred_from: dt.datetime | None = None,
        occurred_to: dt.datetime | None = None,
    ) -> Page[AuditEvent]:
        before_id: int | None = None
        if cursor is not None:
            if not cursor.isdecimal():
                raise InvalidCursorError
            before_id = int(cursor)
        rows = self._repo.find_page(
            limit=limit + 1,
            before_id=before_id,
            action=action,
            entity_id=entity_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        next_cursor = str(rows[limit - 1].id) if len(rows) > limit else None
        return Page(items=rows[:limit], next_cursor=next_cursor)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `uv run pytest tests/db tests/services/test_audit_service.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS. If `test_models_match_migrations` reports a difference, change the migration or the model until they agree; do not weaken the test.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "feat: add database schema, migrations and append-only audit trail"
```

---

### Task 7: Clients

**Files:**
- Create: `backend/src/gerenciador/repositories/keyset.py`, `backend/src/gerenciador/repositories/client_repository.py`, `backend/src/gerenciador/services/client_service.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/services/test_client_service.py`

**Interfaces:**
- Consumes: `FieldCipher`, `field_context` (Task 5); `AuditService.record`, `RequestContext`, `Page`, `encode_cursor`, `decode_cursor`, `NotFoundError`, `ConflictError`, models, `utcnow` (Task 6).
- Produces:
  - `keyset_newest_first(stmt, created_at, id_column, *, before: tuple[datetime, str] | None, limit: int)` returning the statement filtered, ordered and limited
  - `class ClientRepository(session)`: `add(client: Client) -> None`, `get(client_id: str) -> Client | None`, `get_by_cpf_lookup(lookup: str) -> Client | None`, `find_page(*, limit: int, before: tuple[datetime, str] | None) -> list[Client]`, `contracts_of(client_id: str) -> list[Contract]`
  - `@dataclass(frozen=True) class ClientView`: `id: str`, `full_name: str | None`, `cpf: str | None` (11 digits), `address: str | None`, `created_at: datetime`, `updated_at: datetime`, `anonymised_at: datetime | None`
  - `@dataclass(frozen=True) class ClientContractRef`: `contract_id: str`, `role: str` (`"groom"` or `"bride"`), `event_date: date`, `venue_name: str`, `signing_date: date`, `deleted_at: datetime | None`
  - `@dataclass(frozen=True) class ClientExport`: `client: ClientView`, `contracts: list[ClientContractRef]`, `exported_at: datetime`
  - `class ClientService(session: Session, cipher: FieldCipher, audit: AuditService)`:
    - `to_view(client: Client) -> ClientView`
    - `upsert_for_contract(ctx, *, full_name: str, cpf: str, address: str) -> Client` (does **not** commit)
    - `get(client_id: str) -> ClientView`
    - `list_page(*, limit: int, cursor: str | None) -> Page[ClientView]`
    - `update(ctx, client_id: str, *, full_name: str | None = None, cpf: str | None = None, address: str | None = None) -> ClientView` (commits)
    - `export(ctx, client_id: str) -> ClientExport` (commits)
    - `anonymise(ctx, client_id: str) -> ClientView` (commits)
  - pytest fixture `clients`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/conftest.py`:

```python
from gerenciador.services.client_service import ClientService


@pytest.fixture
def clients(session: Session, cipher: FieldCipher, audit: AuditService) -> ClientService:
    return ClientService(session, cipher, audit)
```

`backend/tests/services/test_client_service.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent, Client
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import ConflictError, InvalidCursorError, NotFoundError

GROOM_CPF = "12345678909"
BRIDE_CPF = "98765432100"


def _actions(session: Session) -> list[str]:
    return list(session.scalars(select(AuditEvent.action).order_by(AuditEvent.id)))


def _last_details(session: Session) -> dict[str, object]:
    event = session.scalars(select(AuditEvent).order_by(AuditEvent.id.desc())).first()
    assert event is not None
    return event.details


def _create(clients: ClientService, session: Session, ctx: RequestContext, cpf: str = GROOM_CPF) -> str:
    client = clients.upsert_for_contract(
        ctx, full_name="João da Silva", cpf=cpf, address="Rua das Flores 100"
    )
    session.commit()
    return client.id


def test_upsert_creates_a_client_with_encrypted_fields(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    row = session.get(Client, client_id)
    assert row is not None
    assert row.full_name == "João da Silva"
    assert row.cpf_encrypted is not None and GROOM_CPF not in row.cpf_encrypted
    assert row.address_encrypted is not None and "Flores" not in row.address_encrypted
    assert row.cpf_lookup is not None and GROOM_CPF not in row.cpf_lookup

    view = clients.get(client_id)
    assert view.cpf == GROOM_CPF
    assert view.address == "Rua das Flores 100"
    assert _actions(session) == ["client.created"]


def test_upsert_reuses_a_client_with_the_same_cpf_and_updates_it(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    first_id = _create(clients, session, ctx)
    again = clients.upsert_for_contract(
        ctx, full_name="João Silva", cpf=GROOM_CPF, address="Rua Nova 5"
    )
    session.commit()
    assert again.id == first_id
    view = clients.get(first_id)
    assert view.full_name == "João Silva"
    assert view.address == "Rua Nova 5"
    assert _actions(session) == ["client.created", "client.updated"]
    assert _last_details(session) == {"fields": ["full_name", "address"]}


def test_upsert_with_identical_data_records_nothing(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    _create(clients, session, ctx)
    clients.upsert_for_contract(
        ctx, full_name="João da Silva", cpf=GROOM_CPF, address="Rua das Flores 100"
    )
    session.commit()
    assert _actions(session) == ["client.created"]


def test_upsert_does_not_commit(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    clients.upsert_for_contract(ctx, full_name="A", cpf=GROOM_CPF, address="B")
    session.rollback()
    assert session.scalars(select(Client)).all() == []
    assert _actions(session) == []


def test_get_missing_client(clients: ClientService) -> None:
    with pytest.raises(NotFoundError):
        clients.get("missing")


def test_update_changes_fields_and_audits_their_names_only(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    view = clients.update(ctx, client_id, full_name="João Souza", cpf="11144477735")
    assert view.full_name == "João Souza"
    assert view.cpf == "11144477735"
    assert view.address == "Rua das Flores 100"
    assert _last_details(session) == {"fields": ["full_name", "cpf"]}
    assert "Souza" not in str(_last_details(session))


def test_update_to_another_clients_cpf_conflicts(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    first = _create(clients, session, ctx, GROOM_CPF)
    _create(clients, session, ctx, BRIDE_CPF)
    with pytest.raises(ConflictError):
        clients.update(ctx, first, cpf=BRIDE_CPF)


def test_export_returns_the_data_and_is_audited(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    exported = clients.export(ctx, client_id)
    assert exported.client.cpf == GROOM_CPF
    assert exported.contracts == []
    assert exported.exported_at.tzinfo is not None
    assert _actions(session)[-1] == "client.exported"


def test_anonymise_blanks_all_personal_data(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    view = clients.anonymise(ctx, client_id)
    assert view.full_name is None
    assert view.cpf is None
    assert view.address is None
    assert view.anonymised_at is not None

    session.expire_all()
    row = session.get(Client, client_id)
    assert row is not None
    assert (row.full_name, row.cpf_encrypted, row.cpf_lookup, row.address_encrypted) == (
        None,
        None,
        None,
        None,
    )
    assert _actions(session)[-1] == "client.anonymised"


def test_anonymised_client_cannot_be_anonymised_or_updated_again(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    clients.anonymise(ctx, client_id)
    with pytest.raises(ConflictError):
        clients.anonymise(ctx, client_id)
    with pytest.raises(ConflictError):
        clients.update(ctx, client_id, full_name="X")


def test_an_anonymised_cpf_can_be_registered_again_as_a_new_client(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    first = _create(clients, session, ctx)
    clients.anonymise(ctx, first)
    second = _create(clients, session, ctx)
    assert second != first


def test_list_page_paginates_newest_first(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    ids = [_create(clients, session, ctx, cpf) for cpf in (GROOM_CPF, BRIDE_CPF, "11144477735")]
    first = clients.list_page(limit=2, cursor=None)
    assert [view.id for view in first.items] == [ids[2], ids[1]]
    assert first.next_cursor is not None
    second = clients.list_page(limit=2, cursor=first.next_cursor)
    assert [view.id for view in second.items] == [ids[0]]
    assert second.next_cursor is None


def test_list_page_rejects_malformed_cursor(clients: ClientService) -> None:
    with pytest.raises(InvalidCursorError):
        clients.list_page(limit=2, cursor="garbage")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/services/test_client_service.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.services.client_service'`

- [ ] **Step 3: Write the repository**

`backend/src/gerenciador/repositories/keyset.py`:

```python
"""Keyset pagination: newest first, with the row ID breaking ties."""

import datetime as dt
from typing import Any

from sqlalchemy import Select, and_, or_
from sqlalchemy.orm import InstrumentedAttribute


def keyset_newest_first[T: tuple[Any, ...]](
    stmt: Select[T],
    created_at: InstrumentedAttribute[dt.datetime],
    id_column: InstrumentedAttribute[str],
    *,
    before: tuple[dt.datetime, str] | None,
    limit: int,
) -> Select[T]:
    if before is not None:
        timestamp, last_id = before
        stmt = stmt.where(
            or_(created_at < timestamp, and_(created_at == timestamp, id_column < last_id))
        )
    return stmt.order_by(created_at.desc(), id_column.desc()).limit(limit)
```

`backend/src/gerenciador/repositories/client_repository.py`:

```python
import datetime as dt

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from gerenciador.db.models import Client, Contract
from gerenciador.repositories.keyset import keyset_newest_first


class ClientRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, client: Client) -> None:
        self._session.add(client)
        self._session.flush()

    def get(self, client_id: str) -> Client | None:
        return self._session.get(Client, client_id)

    def get_by_cpf_lookup(self, lookup: str) -> Client | None:
        return self._session.scalars(
            select(Client).where(Client.cpf_lookup == lookup)
        ).one_or_none()

    def find_page(self, *, limit: int, before: tuple[dt.datetime, str] | None) -> list[Client]:
        stmt = keyset_newest_first(
            select(Client), Client.created_at, Client.id, before=before, limit=limit
        )
        return list(self._session.scalars(stmt))

    def contracts_of(self, client_id: str) -> list[Contract]:
        stmt = (
            select(Contract)
            .where(or_(Contract.groom_id == client_id, Contract.bride_id == client_id))
            .order_by(Contract.created_at)
        )
        return list(self._session.scalars(stmt))
```

- [ ] **Step 4: Write the service**

`backend/src/gerenciador/services/client_service.py`:

```python
"""Clients: the only place personal data is read or written."""

import datetime as dt
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import Client
from gerenciador.repositories.client_repository import ClientRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.crypto import FieldCipher, field_context
from gerenciador.services.exceptions import ConflictError, NotFoundError
from gerenciador.services.pagination import Page, decode_cursor, encode_cursor

_ENTITY = "client"


@dataclass(frozen=True)
class ClientView:
    id: str
    full_name: str | None
    cpf: str | None
    address: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    anonymised_at: dt.datetime | None


@dataclass(frozen=True)
class ClientContractRef:
    contract_id: str
    role: str
    event_date: dt.date
    venue_name: str
    signing_date: dt.date
    deleted_at: dt.datetime | None


@dataclass(frozen=True)
class ClientExport:
    client: ClientView
    contracts: list[ClientContractRef]
    exported_at: dt.datetime


class ClientService:
    def __init__(self, session: Session, cipher: FieldCipher, audit: AuditService) -> None:
        self._session = session
        self._repo = ClientRepository(session)
        self._cipher = cipher
        self._audit = audit

    def to_view(self, client: Client) -> ClientView:
        return ClientView(
            id=client.id,
            full_name=client.full_name,
            cpf=self._decrypt(client, "cpf_encrypted", client.cpf_encrypted),
            address=self._decrypt(client, "address_encrypted", client.address_encrypted),
            created_at=client.created_at,
            updated_at=client.updated_at,
            anonymised_at=client.anonymised_at,
        )

    def upsert_for_contract(
        self, ctx: RequestContext, *, full_name: str, cpf: str, address: str
    ) -> Client:
        """Find the person by CPF, or create them. Runs inside the caller's transaction."""
        existing = self._repo.get_by_cpf_lookup(self._cipher.cpf_lookup(cpf))
        if existing is None:
            return self._create(ctx, full_name=full_name, cpf=cpf, address=address)
        changed = self._apply(existing, full_name=full_name, cpf=None, address=address)
        if changed:
            self._audit.record(
                ctx,
                "client.updated",
                entity_type=_ENTITY,
                entity_id=existing.id,
                details={"fields": changed},
            )
        return existing

    def get(self, client_id: str) -> ClientView:
        return self.to_view(self._require(client_id))

    def list_page(self, *, limit: int, cursor: str | None) -> Page[ClientView]:
        before = decode_cursor(cursor) if cursor is not None else None
        rows = self._repo.find_page(limit=limit + 1, before=before)
        next_cursor = (
            encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id)
            if len(rows) > limit
            else None
        )
        return Page(items=[self.to_view(row) for row in rows[:limit]], next_cursor=next_cursor)

    def update(
        self,
        ctx: RequestContext,
        client_id: str,
        *,
        full_name: str | None = None,
        cpf: str | None = None,
        address: str | None = None,
    ) -> ClientView:
        client = self._require(client_id)
        if client.anonymised_at is not None:
            raise ConflictError("client is anonymised and cannot be changed")
        changed = self._apply(client, full_name=full_name, cpf=cpf, address=address)
        if changed:
            self._audit.record(
                ctx,
                "client.updated",
                entity_type=_ENTITY,
                entity_id=client.id,
                details={"fields": changed},
            )
        self._session.commit()
        return self.to_view(client)

    def export(self, ctx: RequestContext, client_id: str) -> ClientExport:
        client = self._require(client_id)
        contracts = [
            ClientContractRef(
                contract_id=contract.id,
                role="groom" if contract.groom_id == client.id else "bride",
                event_date=contract.event_date,
                venue_name=contract.venue_name,
                signing_date=contract.signing_date,
                deleted_at=contract.deleted_at,
            )
            for contract in self._repo.contracts_of(client.id)
        ]
        self._audit.record(ctx, "client.exported", entity_type=_ENTITY, entity_id=client.id)
        self._session.commit()
        return ClientExport(client=self.to_view(client), contracts=contracts, exported_at=utcnow())

    def anonymise(self, ctx: RequestContext, client_id: str) -> ClientView:
        client = self._require(client_id)
        if client.anonymised_at is not None:
            raise ConflictError("client is already anonymised")
        if any(contract.deleted_at is None for contract in self._repo.contracts_of(client.id)):
            raise ConflictError("client has an active contract")
        now = utcnow()
        client.full_name = None
        client.cpf_encrypted = None
        client.cpf_lookup = None
        client.address_encrypted = None
        client.anonymised_at = now
        client.updated_at = now
        self._audit.record(ctx, "client.anonymised", entity_type=_ENTITY, entity_id=client.id)
        self._session.commit()
        return self.to_view(client)

    def _require(self, client_id: str) -> Client:
        client = self._repo.get(client_id)
        if client is None:
            raise NotFoundError(_ENTITY, client_id)
        return client

    def _create(self, ctx: RequestContext, *, full_name: str, cpf: str, address: str) -> Client:
        now = utcnow()
        client = Client(id=str(uuid4()), full_name=full_name, created_at=now, updated_at=now)
        client.cpf_encrypted = self._encrypt(client, "cpf_encrypted", cpf)
        client.cpf_lookup = self._cipher.cpf_lookup(cpf)
        client.address_encrypted = self._encrypt(client, "address_encrypted", address)
        self._repo.add(client)
        self._audit.record(ctx, "client.created", entity_type=_ENTITY, entity_id=client.id)
        return client

    def _apply(
        self, client: Client, *, full_name: str | None, cpf: str | None, address: str | None
    ) -> list[str]:
        """Apply the given values and return the names of the fields that changed."""
        changed: list[str] = []
        if full_name is not None and full_name != client.full_name:
            client.full_name = full_name
            changed.append("full_name")
        if cpf is not None and cpf != self._decrypt(client, "cpf_encrypted", client.cpf_encrypted):
            lookup = self._cipher.cpf_lookup(cpf)
            owner = self._repo.get_by_cpf_lookup(lookup)
            if owner is not None and owner.id != client.id:
                raise ConflictError("another client already has this CPF")
            client.cpf_encrypted = self._encrypt(client, "cpf_encrypted", cpf)
            client.cpf_lookup = lookup
            changed.append("cpf")
        if address is not None and address != self._decrypt(
            client, "address_encrypted", client.address_encrypted
        ):
            client.address_encrypted = self._encrypt(client, "address_encrypted", address)
            changed.append("address")
        if changed:
            client.updated_at = utcnow()
        return changed

    def _encrypt(self, client: Client, column: str, value: str) -> str:
        return self._cipher.encrypt(value, context=field_context("clients", column, client.id))

    def _decrypt(self, client: Client, column: str, token: str | None) -> str | None:
        if token is None:
            return None
        return self._cipher.decrypt(token, context=field_context("clients", column, client.id))
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/services/test_client_service.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add clients with encrypted fields, export and anonymise"
```

---

### Task 8: Contracts

**Files:**
- Create: `backend/src/gerenciador/repositories/contract_repository.py`, `backend/src/gerenciador/services/contract_service.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/services/test_contract_service.py`

**Interfaces:**
- Consumes: `ClientService`, `ClientView` (Task 7); `AuditService`, `RequestContext`, `Page`, cursors, exceptions, models, `keyset_newest_first` (Tasks 6–7); `compute_total_cents`, `ContractRuleError` (Task 3).
- Produces:
  - `class ContractRepository(session)`: `add(contract: Contract) -> None`, `get(contract_id: str) -> Contract | None`, `find_page(*, limit: int, before: tuple[datetime, str] | None, include_deleted: bool) -> list[Contract]`
  - `@dataclass(frozen=True) class PersonInput`: `full_name: str`, `cpf: str` (11 digits)
  - `@dataclass(frozen=True) class ItemInput`: `description: str`, `amount_cents: int`
  - `@dataclass(frozen=True) class ContractInput`: `groom: PersonInput`, `bride: PersonInput`, `couple_address: str`, `event_date: date`, `venue_name: str`, `venue_address: str | None`, `coverage_start: time | None`, `coverage_end: time | None`, `hours_contracted: int | None`, `photographer_count: int`, `items: list[ItemInput]`, `pix_discount_cents: int | None`, `signing_city: str`, `signing_date: date`
  - `@dataclass(frozen=True) class ItemView`: `description: str`, `amount_cents: int`
  - `@dataclass(frozen=True) class ContractView`: `id: str`, `groom: ClientView`, `bride: ClientView`, `couple_address: str | None`, `event_date`, `venue_name`, `venue_address`, `coverage_start`, `coverage_end`, `hours_contracted`, `photographer_count`, `items: list[ItemView]`, `pix_discount_cents: int | None`, `total_cents: int`, `signing_city: str`, `signing_date: date`, `version: int`, `created_at`, `updated_at`, `deleted_at: datetime | None`
  - `class ContractService(session: Session, clients: ClientService, audit: AuditService)`: `create(ctx, data: ContractInput) -> ContractView`, `get(contract_id: str) -> ContractView`, `list_page(*, limit: int, cursor: str | None, include_deleted: bool) -> Page[ContractView]`, `update(ctx, contract_id: str, expected_version: int, data: ContractInput) -> ContractView`, `delete(ctx, contract_id: str) -> None`, `restore(ctx, contract_id: str) -> ContractView`
  - pytest fixtures `contracts`, `make_input`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/conftest.py`:

```python
import datetime as dt
from collections.abc import Callable
from dataclasses import replace
from typing import Any

from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
    PersonInput,
)


@pytest.fixture
def contracts(session: Session, clients: ClientService, audit: AuditService) -> ContractService:
    return ContractService(session, clients, audit)


@pytest.fixture
def make_input() -> Callable[..., ContractInput]:
    def _make(**overrides: Any) -> ContractInput:
        base = ContractInput(
            groom=PersonInput(full_name="João da Silva", cpf="12345678909"),
            bride=PersonInput(full_name="Maria Souza", cpf="98765432100"),
            couple_address="Rua das Flores 100",
            event_date=dt.date(2027, 3, 14),
            venue_name="Igreja Matriz",
            venue_address=None,
            coverage_start=dt.time(16, 0),
            coverage_end=None,
            hours_contracted=None,
            photographer_count=2,
            items=[
                ItemInput("Diária segundo fotógrafo", 50000),
                ItemInput("Cobertura da cerimônia na igreja", 120000),
                ItemInput("Cobertura das fotos protocolares e jantar", 60000),
            ],
            pix_discount_cents=30000,
            signing_city="Curitiba",
            signing_date=dt.date(2026, 10, 13),
        )
        return replace(base, **overrides)

    return _make
```

`backend/tests/services/test_contract_service.py`:

```python
import datetime as dt
from collections.abc import Callable

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent, Client, Contract
from gerenciador.domain.contract import ContractRuleError
from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
    PersonInput,
)
from gerenciador.services.exceptions import ConflictError, NotFoundError, StaleVersionError

MakeInput = Callable[..., ContractInput]


def _actions(session: Session) -> list[str]:
    return list(session.scalars(select(AuditEvent.action).order_by(AuditEvent.id)))


def _last_event(session: Session) -> AuditEvent:
    event = session.scalars(select(AuditEvent).order_by(AuditEvent.id.desc())).first()
    assert event is not None
    return event


def test_create_stores_the_contract_and_both_clients(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    view = contracts.create(ctx, make_input())
    assert view.version == 1
    assert view.total_cents == 200000
    assert view.groom.full_name == "João da Silva"
    assert view.bride.cpf == "98765432100"
    assert view.couple_address == "Rua das Flores 100"
    assert [item.amount_cents for item in view.items] == [50000, 120000, 60000]
    assert view.deleted_at is None
    assert _actions(session) == ["client.created", "client.created", "contract.created"]
    assert _last_event(session).entity_id == view.id
    assert _last_event(session).details == {"version": 1}
    assert contracts.get(view.id) == view


def test_create_reuses_existing_clients(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    first = contracts.create(ctx, make_input())
    second = contracts.create(ctx, make_input(event_date=dt.date(2028, 1, 1)))
    assert second.groom.id == first.groom.id
    assert len(session.scalars(select(Client)).all()) == 2


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"bride": PersonInput("Maria Souza", "12345678909")}, "bride.cpf"),
        ({"items": []}, "payment.items"),
        ({"pix_discount_cents": 230000}, "payment.pix_discount_cents"),
    ],
)
def test_create_enforces_rules_and_stores_nothing(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    overrides: dict[str, object],
    field: str,
) -> None:
    with pytest.raises(ContractRuleError) as error:
        contracts.create(ctx, make_input(**overrides))
    assert error.value.field == field
    session.rollback()
    assert session.scalars(select(Contract)).all() == []
    assert session.scalars(select(Client)).all() == []
    assert _actions(session) == []


def test_a_failed_audit_write_rolls_back_the_contract(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _fail(*args: object, **kwargs: object) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(AuditService, "record", _fail)
    with pytest.raises(RuntimeError):
        contracts.create(ctx, make_input())
    session.rollback()
    assert session.scalars(select(Contract)).all() == []
    assert session.scalars(select(Client)).all() == []


def test_get_missing_contract(contracts: ContractService) -> None:
    with pytest.raises(NotFoundError):
        contracts.get("missing")


def test_update_changes_fields_bumps_version_and_audits_names(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    updated = contracts.update(
        ctx,
        created.id,
        1,
        make_input(venue_name="Catedral", items=[ItemInput("Cobertura completa", 250000)]),
    )
    assert updated.version == 2
    assert updated.venue_name == "Catedral"
    assert [(item.description, item.amount_cents) for item in updated.items] == [
        ("Cobertura completa", 250000)
    ]
    assert updated.total_cents == 220000
    assert updated.updated_at >= created.updated_at
    event = _last_event(session)
    assert event.action == "contract.updated"
    assert event.details == {"fields": ["venue_name", "items"], "version": 2}


def test_update_with_no_changes_keeps_version_and_records_nothing(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    before = _actions(session)
    updated = contracts.update(ctx, created.id, 1, make_input())
    assert updated.version == 1
    assert _actions(session) == before


def test_update_with_a_stale_version_is_refused(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.update(ctx, created.id, 1, make_input(venue_name="Catedral"))
    with pytest.raises(StaleVersionError):
        contracts.update(ctx, created.id, 1, make_input(venue_name="Capela"))
    assert contracts.get(created.id).venue_name == "Catedral"


def test_update_can_point_to_a_different_person(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    updated = contracts.update(
        ctx, created.id, 1, make_input(groom=PersonInput("Pedro Lima", "11144477735"))
    )
    assert updated.groom.id != created.groom.id
    assert updated.groom.full_name == "Pedro Lima"
    assert _last_event(session).details == {"fields": ["groom"], "version": 2}


def test_delete_is_soft_and_idempotent(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    assert contracts.get(created.id).deleted_at is not None
    assert _actions(session)[-1] == "contract.deleted"

    count = len(_actions(session))
    contracts.delete(ctx, created.id)
    assert len(_actions(session)) == count


def test_deleted_contract_cannot_be_edited(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    with pytest.raises(ConflictError):
        contracts.update(ctx, created.id, 1, make_input(venue_name="Catedral"))


def test_restore(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    with pytest.raises(ConflictError):
        contracts.restore(ctx, created.id)
    contracts.delete(ctx, created.id)
    restored = contracts.restore(ctx, created.id)
    assert restored.deleted_at is None
    assert _actions(session)[-1] == "contract.restored"


def test_list_page_hides_deleted_unless_asked(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    first = contracts.create(ctx, make_input())
    second = contracts.create(ctx, make_input(event_date=dt.date(2028, 1, 1)))
    third = contracts.create(ctx, make_input(event_date=dt.date(2029, 1, 1)))
    contracts.delete(ctx, second.id)

    page = contracts.list_page(limit=10, cursor=None, include_deleted=False)
    assert [view.id for view in page.items] == [third.id, first.id]

    everything = contracts.list_page(limit=2, cursor=None, include_deleted=True)
    assert [view.id for view in everything.items] == [third.id, second.id]
    rest = contracts.list_page(limit=2, cursor=everything.next_cursor, include_deleted=True)
    assert [view.id for view in rest.items] == [first.id]
    assert rest.next_cursor is None


def test_anonymise_is_refused_while_a_contract_is_active(
    contracts: ContractService, clients: ClientService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    with pytest.raises(ConflictError, match="active contract"):
        clients.anonymise(ctx, created.groom.id)


def test_restore_is_refused_once_a_client_is_anonymised(
    contracts: ContractService, clients: ClientService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    clients.anonymise(ctx, created.groom.id)
    with pytest.raises(ConflictError, match="anonymised"):
        contracts.restore(ctx, created.id)
    view = contracts.get(created.id)
    assert view.groom.full_name is None
    assert view.couple_address is None


def test_export_lists_the_clients_contracts(
    contracts: ContractService, clients: ClientService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    exported = clients.export(ctx, created.bride.id)
    assert [(ref.contract_id, ref.role) for ref in exported.contracts] == [(created.id, "bride")]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/services/test_contract_service.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.services.contract_service'`

- [ ] **Step 3: Write the repository**

`backend/src/gerenciador/repositories/contract_repository.py`:

```python
import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import Contract
from gerenciador.repositories.keyset import keyset_newest_first


class ContractRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, contract: Contract) -> None:
        self._session.add(contract)
        self._session.flush()

    def get(self, contract_id: str) -> Contract | None:
        return self._session.get(Contract, contract_id)

    def find_page(
        self, *, limit: int, before: tuple[dt.datetime, str] | None, include_deleted: bool
    ) -> list[Contract]:
        stmt = select(Contract)
        if not include_deleted:
            stmt = stmt.where(Contract.deleted_at.is_(None))
        stmt = keyset_newest_first(
            stmt, Contract.created_at, Contract.id, before=before, limit=limit
        )
        return list(self._session.scalars(stmt))
```

- [ ] **Step 4: Write the service**

`backend/src/gerenciador/services/contract_service.py`:

```python
"""Contracts: create, read, edit, soft delete and restore."""

import datetime as dt
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import Client, Contract, ContractItem
from gerenciador.domain.contract import ContractRuleError, compute_total_cents
from gerenciador.repositories.contract_repository import ContractRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService, ClientView
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import ConflictError, NotFoundError, StaleVersionError
from gerenciador.services.pagination import Page, decode_cursor, encode_cursor

_ENTITY = "contract"
_SCALAR_FIELDS = (
    "event_date",
    "venue_name",
    "venue_address",
    "coverage_start",
    "coverage_end",
    "hours_contracted",
    "photographer_count",
    "pix_discount_cents",
    "signing_city",
    "signing_date",
)


@dataclass(frozen=True)
class PersonInput:
    full_name: str
    cpf: str


@dataclass(frozen=True)
class ItemInput:
    description: str
    amount_cents: int


@dataclass(frozen=True)
class ContractInput:
    groom: PersonInput
    bride: PersonInput
    couple_address: str
    event_date: dt.date
    venue_name: str
    venue_address: str | None
    coverage_start: dt.time | None
    coverage_end: dt.time | None
    hours_contracted: int | None
    photographer_count: int
    items: list[ItemInput]
    pix_discount_cents: int | None
    signing_city: str
    signing_date: dt.date


@dataclass(frozen=True)
class ItemView:
    description: str
    amount_cents: int


@dataclass(frozen=True)
class ContractView:
    id: str
    groom: ClientView
    bride: ClientView
    couple_address: str | None
    event_date: dt.date
    venue_name: str
    venue_address: str | None
    coverage_start: dt.time | None
    coverage_end: dt.time | None
    hours_contracted: int | None
    photographer_count: int
    items: list[ItemView]
    pix_discount_cents: int | None
    total_cents: int
    signing_city: str
    signing_date: dt.date
    version: int
    created_at: dt.datetime
    updated_at: dt.datetime
    deleted_at: dt.datetime | None


def _check_rules(data: ContractInput) -> None:
    if data.groom.cpf == data.bride.cpf:
        raise ContractRuleError("bride.cpf", "os CPFs dos contratantes devem ser diferentes")
    compute_total_cents([item.amount_cents for item in data.items], data.pix_discount_cents)


def _new_items(data: ContractInput) -> list[ContractItem]:
    return [
        ContractItem(
            id=str(uuid4()),
            position=position,
            description=item.description,
            amount_cents=item.amount_cents,
        )
        for position, item in enumerate(data.items)
    ]


class ContractService:
    def __init__(self, session: Session, clients: ClientService, audit: AuditService) -> None:
        self._session = session
        self._repo = ContractRepository(session)
        self._clients = clients
        self._audit = audit

    def create(self, ctx: RequestContext, data: ContractInput) -> ContractView:
        _check_rules(data)
        groom = self._upsert(ctx, data.groom, data.couple_address)
        bride = self._upsert(ctx, data.bride, data.couple_address)
        now = utcnow()
        contract = Contract(
            id=str(uuid4()),
            groom=groom,
            bride=bride,
            items=_new_items(data),
            version=1,
            created_at=now,
            updated_at=now,
            **{field: getattr(data, field) for field in _SCALAR_FIELDS},
        )
        self._repo.add(contract)
        self._audit.record(
            ctx, "contract.created", entity_type=_ENTITY, entity_id=contract.id, details={"version": 1}
        )
        self._session.commit()
        return self._to_view(contract)

    def get(self, contract_id: str) -> ContractView:
        return self._to_view(self._require(contract_id))

    def list_page(
        self, *, limit: int, cursor: str | None, include_deleted: bool
    ) -> Page[ContractView]:
        before = decode_cursor(cursor) if cursor is not None else None
        rows = self._repo.find_page(
            limit=limit + 1, before=before, include_deleted=include_deleted
        )
        next_cursor = (
            encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id)
            if len(rows) > limit
            else None
        )
        return Page(items=[self._to_view(row) for row in rows[:limit]], next_cursor=next_cursor)

    def update(
        self, ctx: RequestContext, contract_id: str, expected_version: int, data: ContractInput
    ) -> ContractView:
        contract = self._require(contract_id)
        if contract.deleted_at is not None:
            raise ConflictError("contract is deleted; restore it before editing")
        if contract.version != expected_version:
            raise StaleVersionError
        _check_rules(data)
        groom = self._upsert(ctx, data.groom, data.couple_address)
        bride = self._upsert(ctx, data.bride, data.couple_address)

        changed: list[str] = []
        if contract.groom_id != groom.id:
            contract.groom = groom
            changed.append("groom")
        if contract.bride_id != bride.id:
            contract.bride = bride
            changed.append("bride")
        for field in _SCALAR_FIELDS:
            if getattr(contract, field) != getattr(data, field):
                setattr(contract, field, getattr(data, field))
                changed.append(field)
        current_items = [(item.description, item.amount_cents) for item in contract.items]
        if current_items != [(item.description, item.amount_cents) for item in data.items]:
            contract.items = _new_items(data)
            changed.append("items")

        if changed:
            contract.version += 1
            contract.updated_at = utcnow()
            self._audit.record(
                ctx,
                "contract.updated",
                entity_type=_ENTITY,
                entity_id=contract.id,
                details={"fields": changed, "version": contract.version},
            )
        self._session.commit()
        return self._to_view(contract)

    def delete(self, ctx: RequestContext, contract_id: str) -> None:
        contract = self._require(contract_id)
        if contract.deleted_at is not None:
            return
        contract.deleted_at = utcnow()
        self._audit.record(ctx, "contract.deleted", entity_type=_ENTITY, entity_id=contract.id)
        self._session.commit()

    def restore(self, ctx: RequestContext, contract_id: str) -> ContractView:
        contract = self._require(contract_id)
        if contract.deleted_at is None:
            raise ConflictError("contract is not deleted")
        if contract.groom.anonymised_at is not None or contract.bride.anonymised_at is not None:
            raise ConflictError("a client of this contract has been anonymised")
        contract.deleted_at = None
        self._audit.record(ctx, "contract.restored", entity_type=_ENTITY, entity_id=contract.id)
        self._session.commit()
        return self._to_view(contract)

    def _upsert(self, ctx: RequestContext, person: PersonInput, address: str) -> Client:
        return self._clients.upsert_for_contract(
            ctx, full_name=person.full_name, cpf=person.cpf, address=address
        )

    def _require(self, contract_id: str) -> Contract:
        contract = self._repo.get(contract_id)
        if contract is None:
            raise NotFoundError(_ENTITY, contract_id)
        return contract

    def _to_view(self, contract: Contract) -> ContractView:
        groom = self._clients.to_view(contract.groom)
        items = [ItemView(item.description, item.amount_cents) for item in contract.items]
        subtotal = sum(item.amount_cents for item in items)
        return ContractView(
            id=contract.id,
            groom=groom,
            bride=self._clients.to_view(contract.bride),
            couple_address=groom.address,
            event_date=contract.event_date,
            venue_name=contract.venue_name,
            venue_address=contract.venue_address,
            coverage_start=contract.coverage_start,
            coverage_end=contract.coverage_end,
            hours_contracted=contract.hours_contracted,
            photographer_count=contract.photographer_count,
            items=items,
            pix_discount_cents=contract.pix_discount_cents,
            total_cents=subtotal - (contract.pix_discount_cents or 0),
            signing_city=contract.signing_city,
            signing_date=contract.signing_date,
            version=contract.version,
            created_at=contract.created_at,
            updated_at=contract.updated_at,
            deleted_at=contract.deleted_at,
        )
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/services -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add contracts with versioned edits and soft delete"
```

---

### Task 9: Contract template and renderer

**Files:**
- Modify: `base_contract/contract_template.md`
- Create: `backend/src/gerenciador/services/contract_renderer.py`
- Test: `backend/tests/services/test_contract_renderer.py`

**Interfaces:**
- Consumes: `ContractView` (Task 8); `Settings` (Task 4); `format_cpf` (Task 1); `format_brl`, `amount_in_words` (Task 2); wording functions (Task 3).
- Produces:
  - `escape_markdown(value: str) -> str`
  - `class ContractRenderer(template_path: Path, settings: Settings)`: `render_markdown(contract: ContractView) -> str`, `render_html(contract: ContractView) -> str`. Both raise `ValueError` if a client of the contract is anonymised. The constructor raises if the template file is missing or malformed.

- [ ] **Step 1: Convert the template to Jinja2**

Make three edits to `base_contract/contract_template.md`.

Replace the single line `{{payment_items}}` with:

```
{% for item in payment_items %}
* **{{ item.amount }}** \- {{ item.description }}
{% endfor %}
```

Replace the line `Dado o pagamento via pix, aplica-se o desconto de **{{pix_discount}}**.` with:

```
{% if pix_discount %}
Dado o pagamento via pix, aplica-se o desconto de **{{pix_discount}}**.
{% endif %}
```

Delete the four lines that contain only `#` (empty headings) between the last `---` and `# 24\. ASSINATURAS`. They were a page-break trick from Google Docs; the stylesheet in Step 4 starts the signatures on a new page instead.

- [ ] **Step 2: Write the failing test**

`backend/tests/services/test_contract_renderer.py`:

```python
import datetime as dt
import re
from collections.abc import Callable
from pathlib import Path

import pytest

from gerenciador.config import Settings
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_renderer import ContractRenderer, escape_markdown
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
    PersonInput,
)

MakeInput = Callable[..., ContractInput]


@pytest.fixture
def renderer(settings: Settings) -> ContractRenderer:
    return ContractRenderer(settings.template_path, settings)


def _html(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    data: ContractInput,
) -> str:
    return renderer.render_html(contracts.create(ctx, data))


def test_escape_markdown() -> None:
    assert escape_markdown("Rua A, 10 - Centro") == r"Rua A\, 10 \- Centro"
    assert escape_markdown("  a\n\nb\tc\x00d  ") == "a b c d"
    assert escape_markdown("*x* _y_ <b> [l](u) #") == r"\*x\* \_y\_ \<b\> \[l\]\(u\) \#"
    assert escape_markdown("João Água") == "João Água"


def test_markdown_fills_every_placeholder(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    markdown = renderer.render_markdown(contracts.create(ctx, make_input()))
    assert "{{" not in markdown
    assert "{%" not in markdown
    assert not re.search(r"^#\s*$", markdown, flags=re.MULTILINE)


def test_html_contains_the_parties(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert (
        "CONTRATADA: Fotografia Teste, inscrita no CPF sob nº 111.444.777-35, "
        "com endereço em Rua Exemplo 1 - Centro, neste ato representada por Pessoa Teste,"
    ) in html
    assert (
        "CONTRATANTES: João da Silva e Maria Souza, inscritos nos CPFs sob nº "
        "123.456.789-09 e 987.654.321-00, residentes e domiciliados em Rua das Flores 100,"
    ) in html
    assert "Nome: João da Silva" in html
    assert "Nome: Maria Souza" in html
    assert "CPF: 987.654.321-00" in html
    assert "Curitiba, 13 de outubro de 2026." in html


def test_html_contains_the_event_and_defaults(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert "Data do evento: 14 de março de 2027" in html
    assert "Local: Igreja Matriz" in html
    assert "Endereço: A definir" in html
    assert "Horário de início da cobertura: 16:00" in html
    assert "Horário previsto para término: A definir" in html
    assert "Quantidade de horas contratadas: A definir" in html
    assert "Quantidade de fotógrafos: 2 (dois)" in html
    assert "A cobertura será realizada por 2 (dois) fotógrafos, salvo" in html
    assert "A equipe será composta por 2 (dois) fotógrafos, salvo" in html


def test_html_contains_the_payment(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert "<strong>R$ 2.000,00 (dois mil reais)</strong>" in html
    assert "<li><strong>R$ 500,00</strong> - Diária segundo fotógrafo</li>" in html
    assert "<li><strong>R$ 1.200,00</strong> - Cobertura da cerimônia na igreja</li>" in html
    assert "aplica-se o desconto de <strong>R$ 300,00</strong>." in html


def test_discount_sentence_is_omitted_without_a_discount(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(renderer, contracts, ctx, make_input(pix_discount_cents=None))
    assert "aplica-se o desconto" not in html
    assert "<strong>R$ 2.300,00 (dois mil e trezentos reais)</strong>" in html


def test_optional_values_and_singular_photographer(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(
        renderer,
        contracts,
        ctx,
        make_input(
            venue_address="Praça Central 1",
            coverage_end=dt.time(23, 30),
            hours_contracted=7,
            photographer_count=1,
        ),
    )
    assert "Endereço: Praça Central 1" in html
    assert "Horário previsto para término: 23:30" in html
    assert "Quantidade de horas contratadas: 7 horas" in html
    assert "Quantidade de fotógrafos: 1 (um)" in html
    assert "A cobertura será realizada por 1 (um) fotógrafo, salvo" in html


def test_markdown_and_html_in_names_print_literally(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    hostile = "Ana *Lima* <b>x</b> [link](http://evil.example) # fim"
    html = _html(renderer, contracts, ctx, make_input(groom=PersonInput(hostile, "12345678909")))
    assert "Ana *Lima* &lt;b&gt;x&lt;/b&gt; [link](http://evil.example) # fim" in html
    assert "<em>" not in html
    assert "<a " not in html
    assert "<b>" not in html


def test_newlines_in_values_cannot_add_structure(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    baseline = _html(renderer, contracts, ctx, make_input())
    injected = _html(
        renderer,
        contracts,
        ctx,
        make_input(
            couple_address="Rua A\n\n# Injetado\n\n* item",
            items=[ItemInput("Cobertura\n\n# Outro", 230000)],
            pix_discount_cents=None,
        ),
    )
    assert injected.count("<h1") == baseline.count("<h1")
    assert "Rua A # Injetado * item" in injected


def test_template_syntax_in_values_is_not_evaluated(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(
        renderer,
        contracts,
        ctx,
        make_input(venue_name="{{ contractor_cpf }} {% for x in y %}"),
    )
    assert "Local: {{ contractor_cpf }} {% for x in y %}" in html


def test_html_document_shell_loads_no_external_resource(
    renderer: ContractRenderer, contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert html.startswith("<!doctype html>")
    assert '<html lang="pt-BR">' in html
    assert "<link" not in html
    assert "<script" not in html
    assert "src=" not in html
    assert not re.search(r"<h1>\s*</h1>", html)


def test_anonymised_client_cannot_be_rendered(
    renderer: ContractRenderer,
    contracts: ContractService,
    clients: ClientService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    clients.anonymise(ctx, created.groom.id)
    with pytest.raises(ValueError, match="anonymised"):
        renderer.render_html(contracts.get(created.id))


def test_missing_template_fails_at_construction(settings: Settings, tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        ContractRenderer(tmp_path / "missing.md", settings)
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/services/test_contract_renderer.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.services.contract_renderer'`

- [ ] **Step 4: Write the implementation**

`backend/src/gerenciador/services/contract_renderer.py`:

```python
"""Fill the contract template and turn it into a printable HTML document."""

import re
from pathlib import Path
from typing import Any

from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment
from markdown_it import MarkdownIt

from gerenciador.config import Settings
from gerenciador.domain.contract import (
    format_hours,
    format_long_date,
    format_time,
    photographer_count_text,
    photographers_phrase,
    text_or_to_be_defined,
)
from gerenciador.domain.cpf import format_cpf
from gerenciador.domain.money import amount_in_words, format_brl
from gerenciador.services.contract_service import ContractView

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_WHITESPACE = re.compile(r"\s+")
_MD_PUNCTUATION = re.compile(r"([!-/:-@\[-`{-~])")

_CSS = """
@page {
  size: A4;
  margin: 2.5cm 2cm;
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; }
}
body {
  font-family: serif;
  font-size: 11pt;
  line-height: 1.4;
  text-align: justify;
  font-variant-ligatures: none;
}
h1 { font-size: 13pt; margin: 1.2em 0 0.6em; break-after: avoid; }
h1:first-of-type { text-align: center; }
h1:last-of-type { break-before: page; }
h3 { font-size: 11pt; margin: 1.6em 0 0.4em; break-after: avoid; }
hr { border: 0; margin: 0; }
ul { margin: 0.4em 0; }
"""

_HTML_SHELL = (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    "<title>Contrato</title><style>{css}</style></head><body>{body}</body></html>"
)


def escape_markdown(value: str) -> str:
    """Make a typed value inert: one line, with every Markdown character escaped."""
    flattened = _WHITESPACE.sub(" ", _CONTROL.sub(" ", value)).strip()
    return _MD_PUNCTUATION.sub(r"\\\1", flattened)


def _person_text(value: str | None) -> str:
    if value is None:
        raise ValueError("contract has an anonymised client and cannot be rendered")
    return escape_markdown(value)


def _person_cpf(digits: str | None) -> str:
    if digits is None:
        raise ValueError("contract has an anonymised client and cannot be rendered")
    return format_cpf(digits)


class ContractRenderer:
    def __init__(self, template_path: Path, settings: Settings) -> None:
        # The template is trusted. Typed values are escaped for Markdown below,
        # and raw HTML is disabled in the Markdown step.
        environment = SandboxedEnvironment(
            undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True
        )
        self._template = environment.from_string(template_path.read_text(encoding="utf-8"))
        self._markdown = MarkdownIt("commonmark", {"html": False})
        self._settings = settings

    def render_markdown(self, contract: ContractView) -> str:
        return self._template.render(self._context(contract))

    def render_html(self, contract: ContractView) -> str:
        body = self._markdown.render(self.render_markdown(contract))
        return _HTML_SHELL.format(css=_CSS, body=body)

    def _context(self, contract: ContractView) -> dict[str, Any]:
        settings = self._settings
        discount = contract.pix_discount_cents
        return {
            "contractor_name": escape_markdown(settings.contractor_name),
            "contractor_cpf": format_cpf(settings.contractor_cpf),
            "contractor_address": escape_markdown(settings.contractor_address),
            "contractor_representative": escape_markdown(settings.contractor_representative),
            "groom_name": _person_text(contract.groom.full_name),
            "groom_cpf": _person_cpf(contract.groom.cpf),
            "bride_name": _person_text(contract.bride.full_name),
            "bride_cpf": _person_cpf(contract.bride.cpf),
            "couple_address": _person_text(contract.couple_address),
            "event_date": format_long_date(contract.event_date),
            "venue_name": escape_markdown(contract.venue_name),
            "venue_address": escape_markdown(text_or_to_be_defined(contract.venue_address)),
            "coverage_start": format_time(contract.coverage_start),
            "coverage_end": format_time(contract.coverage_end),
            "hours_contracted": format_hours(contract.hours_contracted),
            "photographer_count": photographer_count_text(contract.photographer_count),
            "photographers": photographers_phrase(contract.photographer_count),
            "total_price": format_brl(contract.total_cents),
            "total_price_in_words": amount_in_words(contract.total_cents),
            "payment_items": [
                {
                    "amount": format_brl(item.amount_cents),
                    "description": escape_markdown(item.description),
                }
                for item in contract.items
            ],
            "pix_discount": None if discount is None else format_brl(discount),
            "signing_city": escape_markdown(contract.signing_city),
            "signing_date": format_long_date(contract.signing_date),
        }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/services/test_contract_renderer.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ../base_contract . && git commit -m "feat: render the contract template to HTML with escaped values"
```

---

### Task 10: PDF generation

**Files:**
- Create: `backend/src/gerenciador/services/pdf_renderer.py`, `backend/src/gerenciador/services/contract_document.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/services/test_contract_document.py`

**Interfaces:**
- Consumes: `ContractRenderer.render_html` (Task 9); `ContractService.get`, `ContractView` (Task 8); `AuditService.record`, `ConflictError`, `RequestContext` (Task 6).
- Produces:
  - `class PdfRenderer(Protocol)`: `render(html: str) -> bytes`
  - `class WeasyPrintRenderer`: implements `PdfRenderer`; fetches no external resource
  - `pdf_filename(contract: ContractView) -> str` (`"contrato-joao-maria-2027-03-14.pdf"`)
  - `@dataclass(frozen=True) class GeneratedPdf`: `content: bytes`, `sha256: str`, `filename: str`
  - `class ContractDocumentService(session: Session, contracts: ContractService, audit: AuditService, renderer: ContractRenderer, pdf: PdfRenderer)`: `generate(ctx, contract_id: str) -> GeneratedPdf` (commits; raises `ConflictError` for a deleted contract)
  - pytest fixture `documents`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/conftest.py`:

```python
from gerenciador.services.contract_document import ContractDocumentService
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.pdf_renderer import WeasyPrintRenderer


@pytest.fixture
def documents(
    session: Session, contracts: ContractService, audit: AuditService, settings: Settings
) -> ContractDocumentService:
    renderer = ContractRenderer(settings.template_path, settings)
    return ContractDocumentService(session, contracts, audit, renderer, WeasyPrintRenderer())
```

`backend/tests/services/test_contract_document.py`:

```python
import hashlib
import io
from collections.abc import Callable

import pytest
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent
from gerenciador.services import pdf_renderer
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService, pdf_filename
from gerenciador.services.contract_service import ContractInput, ContractService, PersonInput
from gerenciador.services.exceptions import ConflictError
from gerenciador.services.pdf_renderer import WeasyPrintRenderer

MakeInput = Callable[..., ContractInput]


def _pages(content: bytes) -> list[str]:
    """Text of each page with all whitespace removed, so line breaks do not matter."""
    return ["".join((page.extract_text() or "").split()) for page in PdfReader(io.BytesIO(content)).pages]


def test_generate_produces_the_contract_as_pdf(
    documents: ContractDocumentService,
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    created = contracts.create(ctx, make_input())
    pdf = documents.generate(ctx, created.id)

    assert pdf.content.startswith(b"%PDF")
    assert pdf.sha256 == hashlib.sha256(pdf.content).hexdigest()
    assert pdf.filename == "contrato-joao-maria-2027-03-14.pdf"

    pages = _pages(pdf.content)
    text = "".join(pages)
    for expected in (
        "CONTRATODEPRESTAÇÃODESERVIÇOSDEFOTOGRAFIADECASAMENTO",
        "JoãodaSilvaeMariaSouza",
        "123.456.789-09e987.654.321-00",
        "R$2.000,00(doismilreais)",
        "14demarçode2027",
        "Curitiba,13deoutubrode2026.",
    ):
        assert expected in text
    assert len(pages) >= 2
    assert "24.ASSINATURAS" in pages[-1]
    assert "23.DOFORO" not in pages[-1]

    event = session.scalars(select(AuditEvent).order_by(AuditEvent.id.desc())).first()
    assert event is not None
    assert event.action == "contract.pdf_generated"
    assert event.entity_id == created.id
    assert event.details == {"version": 1, "sha256": pdf.sha256}


def test_generate_is_refused_for_a_deleted_contract(
    documents: ContractDocumentService,
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    with pytest.raises(ConflictError):
        documents.generate(ctx, created.id)
    actions = list(session.scalars(select(AuditEvent.action)))
    assert "contract.pdf_generated" not in actions


def test_filename_is_ascii_and_safe(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    view = contracts.create(
        ctx,
        make_input(
            groom=PersonInput('José "Zé" d\'Ávila', "12345678909"),
            bride=PersonInput("Ângela/../x Souza", "98765432100"),
        ),
    )
    assert pdf_filename(view) == "contrato-jose-angelax-2027-03-14.pdf"


def test_renderer_fetches_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    requested: list[str] = []

    def _spy(url: str, *args: object, **kwargs: object) -> dict[str, object]:
        requested.append(url)
        raise ValueError("blocked")

    monkeypatch.setattr(pdf_renderer, "_deny_all", _spy)
    html = (
        '<html><head><link rel="stylesheet" href="http://example.invalid/x.css"></head>'
        '<body><img src="file:///etc/hosts"><p>ok</p></body></html>'
    )
    content = WeasyPrintRenderer().render(html)
    assert content.startswith(b"%PDF")
    assert "file:///etc/hosts" in requested
    assert "http://example.invalid/x.css" in requested


def test_deny_all_raises() -> None:
    with pytest.raises(ValueError, match="disabled"):
        pdf_renderer._deny_all("file:///etc/passwd")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/services/test_contract_document.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.services.contract_document'`

- [ ] **Step 3: Write the implementation**

`backend/src/gerenciador/services/pdf_renderer.py`:

```python
"""HTML to PDF. The engine sits behind PdfRenderer so it can be replaced."""

from typing import Any, Protocol

from weasyprint import HTML


class PdfRenderer(Protocol):
    def render(self, html: str) -> bytes: ...


def _deny_all(url: str, *args: Any, **kwargs: Any) -> dict[str, Any]:
    """Refuse every resource request, so no input can read files or reach the network."""
    raise ValueError(f"resource fetching is disabled: {url}")


class WeasyPrintRenderer:
    def render(self, html: str) -> bytes:
        return bytes(HTML(string=html, url_fetcher=_deny_all).write_pdf())
```

`backend/src/gerenciador/services/contract_document.py`:

```python
"""Generate the PDF of a stored contract and record that it was generated."""

import hashlib
import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy.orm import Session

from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.contract_service import ContractService, ContractView
from gerenciador.services.exceptions import ConflictError
from gerenciador.services.pdf_renderer import PdfRenderer

_NOT_SLUG = re.compile(r"[^a-z0-9]")


@dataclass(frozen=True)
class GeneratedPdf:
    content: bytes
    sha256: str
    filename: str


def _first_name_slug(full_name: str | None) -> str:
    words = (full_name or "").split()
    first = words[0] if words else ""
    ascii_only = unicodedata.normalize("NFKD", first).encode("ascii", "ignore").decode("ascii")
    return _NOT_SLUG.sub("", ascii_only.lower())


def pdf_filename(contract: ContractView) -> str:
    parts = [
        _first_name_slug(contract.groom.full_name),
        _first_name_slug(contract.bride.full_name),
        contract.event_date.isoformat(),
    ]
    return "contrato-" + "-".join(part for part in parts if part) + ".pdf"


class ContractDocumentService:
    def __init__(
        self,
        session: Session,
        contracts: ContractService,
        audit: AuditService,
        renderer: ContractRenderer,
        pdf: PdfRenderer,
    ) -> None:
        self._session = session
        self._contracts = contracts
        self._audit = audit
        self._renderer = renderer
        self._pdf = pdf

    def generate(self, ctx: RequestContext, contract_id: str) -> GeneratedPdf:
        contract = self._contracts.get(contract_id)
        if contract.deleted_at is not None:
            raise ConflictError("contract is deleted; restore it before generating the PDF")
        content = self._pdf.render(self._renderer.render_html(contract))
        digest = hashlib.sha256(content).hexdigest()
        self._audit.record(
            ctx,
            "contract.pdf_generated",
            entity_type="contract",
            entity_id=contract.id,
            details={"version": contract.version, "sha256": digest},
        )
        self._session.commit()
        return GeneratedPdf(content=content, sha256=digest, filename=pdf_filename(contract))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/services/test_contract_document.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS. If WeasyPrint prints a deprecation warning about `url_fetcher`, report it in the task summary; do not change the fetcher without a test proving nothing is fetched.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: generate contract PDFs with no external fetching"
```

---

### Task 11: Application shell, errors and request security

**Files:**
- Create: `backend/src/gerenciador/api/__init__.py` (empty), `backend/src/gerenciador/api/deps.py`, `backend/src/gerenciador/api/errors.py`, `backend/src/gerenciador/api/security.py`
- Create: `backend/src/gerenciador/api/v1/__init__.py`, `backend/src/gerenciador/api/v1/health.py`
- Create: `backend/src/gerenciador/main.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/api/test_app.py`

**Interfaces:**
- Consumes: everything from Tasks 4–10.
- Produces:
  - `create_app(settings: Settings | None = None) -> FastAPI`. Sets `app.state.settings`, `app.state.session_factory`, `app.state.cipher`, `app.state.contract_renderer`, `app.state.pdf_renderer`.
  - `problem_response(status: int, detail: str, request_id: str, errors: list[dict[str, str]] | None = None) -> JSONResponse`
  - `register_error_handlers(app: FastAPI) -> None`
  - `class SecurityMiddleware`
  - In `api/deps.py`: `get_current_actor() -> str`, and the annotated dependency aliases `Ctx` (`RequestContext`), `Clients` (`ClientService`), `Contracts` (`ContractService`), `Documents` (`ContractDocumentService`), `Audit` (`AuditService`)
  - `api_router: APIRouter` in `api/v1/__init__.py`; later tasks add their routers to it
  - pytest fixtures `api` (a `TestClient` with a valid `Origin`), and constant `BASE_URL`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/conftest.py`:

```python
from fastapi.testclient import TestClient

from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"


@pytest.fixture
def api(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        yield client
```

`backend/tests/api/test_app.py`:

```python
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"
PROBLEM = "application/problem+json"


def _is_problem(response: Response, status: int) -> dict[str, Any]:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert set(body) >= {"type", "title", "status", "detail", "request_id"}
    return body


def test_health(api: TestClient) -> None:
    response = api.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_every_response_has_a_fresh_request_id(api: TestClient) -> None:
    first = api.get("/api/v1/health", headers={"X-Request-ID": "client-chosen"})
    second = api.get("/api/v1/health")
    assert UUID(first.headers["X-Request-ID"])
    assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]


def test_api_security_headers(api: TestClient) -> None:
    headers = api.get("/api/v1/health").headers
    assert headers["Cache-Control"] == "no-store"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "no-referrer"
    assert headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_docs_page_can_load_its_assets(api: TestClient) -> None:
    response = api.get("/docs")
    assert response.status_code == 200
    assert "https://cdn.jsdelivr.net" in response.headers["Content-Security-Policy"]


@pytest.mark.parametrize("host", ["evil.example", "192.168.0.10:8000", "127.0.0.1.evil.example"])
def test_unknown_host_is_rejected(api: TestClient, host: str) -> None:
    body = _is_problem(api.get("/api/v1/health", headers={"Host": host}), 400)
    assert UUID(body["request_id"])


@pytest.mark.parametrize("host", ["localhost:8000", "127.0.0.1", "localhost"])
def test_loopback_hosts_are_accepted(api: TestClient, host: str) -> None:
    assert api.get("/api/v1/health", headers={"Host": host}).status_code == 200


def test_write_without_origin_is_rejected(api: TestClient) -> None:
    del api.headers["Origin"]
    _is_problem(api.post("/api/v1/health"), 403)


@pytest.mark.parametrize(
    "origin", ["http://evil.example", "https://127.0.0.1:8000", "http://127.0.0.1:9999", "null"]
)
def test_write_from_another_origin_is_rejected(api: TestClient, origin: str) -> None:
    _is_problem(api.post("/api/v1/health", headers={"Origin": origin}), 403)


def test_write_with_a_non_json_body_is_rejected(api: TestClient) -> None:
    response = api.post(
        "/api/v1/health",
        content="a=1",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    _is_problem(response, 415)


def test_http_errors_are_problems(api: TestClient) -> None:
    _is_problem(api.get("/api/v1/nope"), 404)
    _is_problem(api.post("/api/v1/health"), 405)


def test_unhandled_errors_reveal_nothing(settings: Settings) -> None:
    app = create_app(settings)

    def boom() -> None:
        raise RuntimeError("secret detail 12345678909")

    app.add_api_route("/api/v1/boom", boom)
    with TestClient(app, base_url=BASE_URL, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/boom")
    body = _is_problem(response, 500)
    assert "secret" not in response.text
    assert "12345678909" not in response.text
    assert UUID(body["request_id"])
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/api/test_app.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.main'`

- [ ] **Step 3: Write the dependencies and error handling**

`backend/src/gerenciador/api/deps.py`:

```python
"""FastAPI dependencies. Routers get everything they need from here."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService
from gerenciador.services.contract_service import ContractService


def get_current_actor() -> str:
    """Who is making the request. Replace this when login is added."""
    return "owner"


def get_context(
    request: Request, actor: Annotated[str, Depends(get_current_actor)]
) -> RequestContext:
    return RequestContext(actor=actor, request_id=request.state.request_id)


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


DbSession = Annotated[Session, Depends(get_session)]


def get_audit_service(session: DbSession) -> AuditService:
    return AuditService(session)


def get_client_service(request: Request, session: DbSession) -> ClientService:
    return ClientService(session, request.app.state.cipher, AuditService(session))


def get_contract_service(request: Request, session: DbSession) -> ContractService:
    audit = AuditService(session)
    clients = ClientService(session, request.app.state.cipher, audit)
    return ContractService(session, clients, audit)


def get_document_service(request: Request, session: DbSession) -> ContractDocumentService:
    audit = AuditService(session)
    clients = ClientService(session, request.app.state.cipher, audit)
    return ContractDocumentService(
        session,
        ContractService(session, clients, audit),
        audit,
        request.app.state.contract_renderer,
        request.app.state.pdf_renderer,
    )


Ctx = Annotated[RequestContext, Depends(get_context)]
Audit = Annotated[AuditService, Depends(get_audit_service)]
Clients = Annotated[ClientService, Depends(get_client_service)]
Contracts = Annotated[ContractService, Depends(get_contract_service)]
Documents = Annotated[ContractDocumentService, Depends(get_document_service)]
```

`backend/src/gerenciador/api/errors.py`:

```python
"""Every error leaves the API as an RFC 9457 problem, with no internal detail."""

from collections.abc import Sequence
from http import HTTPStatus
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.responses import Response

from gerenciador.api.deps import get_current_actor
from gerenciador.domain.contract import ContractRuleError
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    InvalidCursorError,
    NotFoundError,
    StaleVersionError,
)

PROBLEM_MEDIA_TYPE = "application/problem+json"


def problem_response(
    status: int, detail: str, request_id: str, errors: list[dict[str, str]] | None = None
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "detail": detail,
        "request_id": request_id,
    }
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE)


def _request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "unknown"))


def _field_errors(errors: Sequence[Any]) -> list[dict[str, str]]:
    """Field path and message only. The submitted value is never included."""
    return [
        {
            "field": ".".join(str(part) for part in error["loc"] if part != "body"),
            "message": str(error["msg"]),
        }
        for error in errors
    ]


def _rejected(request: Request, errors: list[dict[str, str]]) -> Response:
    """Answer 422 and audit the rejection: the route and field names, never the values."""
    ctx = RequestContext(actor=get_current_actor(), request_id=_request_id(request))
    with request.app.state.session_factory() as session:
        AuditService(session).record(
            ctx,
            "request.rejected",
            outcome="failure",
            details={
                "route": f"{request.method} {request.url.path}",
                "fields": [error["field"] for error in errors],
            },
        )
        session.commit()
    return problem_response(422, "Request validation failed", _request_id(request), errors)


def _invalid_request(request: Request, exc: Exception) -> Response:
    return _rejected(request, _field_errors(cast(RequestValidationError, exc).errors()))


def _rule_broken(request: Request, exc: Exception) -> Response:
    error = cast(ContractRuleError, exc)
    return _rejected(request, [{"field": error.field, "message": error.message}])


def _invalid_cursor(request: Request, exc: Exception) -> Response:
    return _rejected(request, [{"field": "cursor", "message": "cursor inválido"}])


def _not_found(request: Request, exc: Exception) -> Response:
    return problem_response(404, str(exc), _request_id(request))


def _conflict(request: Request, exc: Exception) -> Response:
    return problem_response(409, cast(ConflictError, exc).message, _request_id(request))


def _stale(request: Request, exc: Exception) -> Response:
    return problem_response(
        412, "The contract changed since it was loaded", _request_id(request)
    )


def _http_error(request: Request, exc: Exception) -> Response:
    error = cast(HTTPException, exc)
    return problem_response(error.status_code, str(error.detail), _request_id(request))


def _unhandled(request: Request, exc: Exception) -> Response:
    return problem_response(500, "Internal server error", _request_id(request))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _invalid_request)
    app.add_exception_handler(ContractRuleError, _rule_broken)
    app.add_exception_handler(InvalidCursorError, _invalid_cursor)
    app.add_exception_handler(NotFoundError, _not_found)
    app.add_exception_handler(ConflictError, _conflict)
    app.add_exception_handler(StaleVersionError, _stale)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
```

- [ ] **Step 4: Write the middleware, health route and app factory**

`backend/src/gerenciador/api/security.py`:

```python
"""Request checks and response headers for an app with no login.

A web page open in the same browser can try to call a server on localhost.
The Host allowlist blocks DNS rebinding, and the Origin and JSON-only checks
block cross-site writes.
"""

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from gerenciador.api.errors import problem_response

ALLOWED_HOSTNAMES = frozenset({"localhost", "127.0.0.1"})
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
_API_CSP = "default-src 'none'; frame-ancestors 'none'"
_APP_CSP = "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
_DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none'"
)
_DOCS_PATHS = frozenset({"/docs", "/redoc"})


def _rejection(request: Request, request_id: str) -> Response | None:
    host = request.headers.get("host", "")
    hostname = host.rsplit(":", 1)[0] if ":" in host else host
    if hostname not in ALLOWED_HOSTNAMES:
        return problem_response(400, "Invalid Host header", request_id)
    if request.method in _SAFE_METHODS:
        return None
    if request.headers.get("origin") != f"http://{host}":
        return problem_response(403, "Origin not allowed", request_id)
    has_body = (
        request.headers.get("content-length", "0") != "0"
        or "transfer-encoding" in request.headers
    )
    media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if has_body and media_type != "application/json":
        return problem_response(415, "Request body must be application/json", request_id)
    return None


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid4())
        request.state.request_id = request_id
        response = _rejection(request, request_id) or await call_next(request)

        path = request.url.path
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Content-Security-Policy"] = _API_CSP
        elif path in _DOCS_PATHS:
            response.headers["Content-Security-Policy"] = _DOCS_CSP
        else:
            response.headers["Content-Security-Policy"] = _APP_CSP
        return response
```

`backend/src/gerenciador/api/v1/health.py`:

```python
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

`backend/src/gerenciador/api/v1/__init__.py`:

```python
from fastapi import APIRouter

from gerenciador.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router)
```

`backend/src/gerenciador/main.py`:

```python
"""Application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from gerenciador.api.errors import register_error_handlers
from gerenciador.api.security import SecurityMiddleware
from gerenciador.api.v1 import api_router
from gerenciador.config import Settings, get_settings
from gerenciador.db.migrate import init_database
from gerenciador.db.session import create_session_factory
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.crypto import FieldCipher
from gerenciador.services.pdf_renderer import WeasyPrintRenderer


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = init_database(settings.database_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(title="Gerenciador Fotografia", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = create_session_factory(engine)
    app.state.cipher = FieldCipher.from_settings(settings)
    app.state.contract_renderer = ContractRenderer(settings.template_path, settings)
    app.state.pdf_renderer = WeasyPrintRenderer()

    app.add_middleware(SecurityMiddleware)
    register_error_handlers(app)
    app.include_router(api_router, prefix="/api/v1")
    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
    return app
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/api/test_app.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS. If mypy rejects a handler passed to `add_exception_handler`, keep the handler signature `(Request, Exception) -> Response` and narrow inside with `cast`, as written.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add app factory, problem responses and request security"
```

---

### Task 12: Contracts API

**Files:**
- Create: `backend/src/gerenciador/api/v1/schemas.py`, `backend/src/gerenciador/api/v1/contracts.py`
- Modify: `backend/src/gerenciador/api/deps.py`, `backend/src/gerenciador/api/v1/__init__.py`, `backend/tests/conftest.py`
- Test: `backend/tests/api/test_contracts_api.py`

**Interfaces:**
- Consumes: `Ctx`, `Contracts`, `Documents` (Task 11); `ContractService`, `ContractInput`, `ContractView` (Task 8); `ContractDocumentService` (Task 10); `ClientView`, `ClientExport` (Task 7); `AuditEvent` (Task 6).
- Produces:
  - In `api/deps.py`: `Limit = Annotated[int, Query(ge=1, le=100)]`
  - In `schemas.py`: `ContractCreate` (with `to_input() -> ContractInput`), `ContractPatch` (with `apply_to(view: ContractView) -> ContractCreate`, raising `pydantic.ValidationError`), `ClientPatch`, `ClientOut` (`from_view(view, *, mask: bool)`), `ContractOut` (`from_view(view, *, mask: bool)`), `ClientExportOut` (`from_export(export)`), `AuditEventOut`, `PageOut[T]`
  - Routes: `POST /contracts`, `GET /contracts`, `GET /contracts/{contract_id}`, `PATCH /contracts/{contract_id}`, `DELETE /contracts/{contract_id}`, `POST /contracts/{contract_id}/restore`, `GET /contracts/{contract_id}/pdf`
  - pytest fixture `payload`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/conftest.py`:

```python
@pytest.fixture
def payload() -> Callable[..., dict[str, Any]]:
    def _make(**overrides: Any) -> dict[str, Any]:
        body: dict[str, Any] = {
            "groom": {"full_name": "João da Silva", "cpf": "123.456.789-09"},
            "bride": {"full_name": "Maria Souza", "cpf": "987.654.321-00"},
            "couple_address": "Rua das Flores 100",
            "event": {
                "date": "2027-03-14",
                "venue_name": "Igreja Matriz",
                "coverage_start": "16:00",
            },
            "photographer_count": 2,
            "payment": {
                "items": [
                    {"description": "Diária segundo fotógrafo", "amount_cents": 50000},
                    {"description": "Cobertura da cerimônia na igreja", "amount_cents": 120000},
                    {
                        "description": "Cobertura das fotos protocolares e jantar",
                        "amount_cents": 60000,
                    },
                ],
                "pix_discount_cents": 30000,
            },
            "signing": {"city": "Curitiba", "date": "2026-10-13"},
        }
        body.update(overrides)
        return body

    return _make
```

`backend/tests/api/test_contracts_api.py`:

```python
import datetime as dt
import hashlib
import io
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select

from gerenciador.db.models import AuditEvent

URL = "/api/v1/contracts"
PROBLEM = "application/problem+json"
Payload = Callable[..., dict[str, Any]]


def _create(api: TestClient, payload: Payload, **overrides: Any) -> dict[str, Any]:
    response = api.post(URL, json=payload(**overrides))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def _with(data: dict[str, Any], path: str, value: Any) -> dict[str, Any]:
    """Set a nested key given a dotted path."""
    target = data
    *parents, last = path.split(".")
    for key in parents:
        target = target[key]
    target[last] = value
    return data


def _fields(response: Any) -> list[str]:
    return [error["field"] for error in response.json()["errors"]]


def test_create_returns_the_contract(api: TestClient, payload: Payload) -> None:
    response = api.post(URL, json=payload())
    assert response.status_code == 201
    body = response.json()
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    assert response.headers["ETag"] == '"1"'
    assert body["groom"]["full_name"] == "João da Silva"
    assert body["groom"]["cpf"] == "123.456.789-09"
    assert body["bride"]["cpf"] == "987.654.321-00"
    assert body["couple_address"] == "Rua das Flores 100"
    assert body["event"] == {
        "date": "2027-03-14",
        "venue_name": "Igreja Matriz",
        "venue_address": None,
        "coverage_start": "16:00:00",
        "coverage_end": None,
        "hours_contracted": None,
    }
    assert body["payment"]["total_cents"] == 200000
    assert body["payment"]["pix_discount_cents"] == 30000
    assert len(body["payment"]["items"]) == 3
    assert body["signing"] == {"city": "Curitiba", "date": "2026-10-13"}
    assert body["version"] == 1
    assert body["deleted_at"] is None


def test_create_applies_defaults(api: TestClient, payload: Payload) -> None:
    data = payload()
    del data["photographer_count"]
    del data["signing"]
    del data["payment"]["pix_discount_cents"]
    response = api.post(URL, json=data)
    assert response.status_code == 201
    body = response.json()
    assert body["photographer_count"] == 2
    assert body["signing"] == {"city": "Curitiba", "date": dt.date.today().isoformat()}
    assert body["payment"]["pix_discount_cents"] is None
    assert body["payment"]["total_cents"] == 230000


@pytest.mark.parametrize(
    ("path", "value", "field"),
    [
        ("groom.cpf", "123.456.789-00", "groom.cpf"),
        ("groom.cpf", "abc12345678909", "groom.cpf"),
        ("groom.full_name", "   ", "groom.full_name"),
        ("groom.full_name", "x" * 201, "groom.full_name"),
        ("couple_address", "", "couple_address"),
        ("event.date", "14/03/2027", "event.date"),
        ("event.venue_name", "x" * 201, "event.venue_name"),
        ("event.hours_contracted", 25, "event.hours_contracted"),
        ("photographer_count", 0, "photographer_count"),
        ("photographer_count", "2", "photographer_count"),
        ("payment.items", [], "payment.items"),
        ("payment.items", [{"description": "x", "amount_cents": 1}] * 21, "payment.items"),
        (
            "payment.items",
            [{"description": "x", "amount_cents": 10.5}],
            "payment.items.0.amount_cents",
        ),
        (
            "payment.items",
            [{"description": "x", "amount_cents": 0}],
            "payment.items.0.amount_cents",
        ),
        ("payment.pix_discount_cents", 230000, "payment.pix_discount_cents"),
        ("bride.cpf", "123.456.789-09", "bride.cpf"),
        ("nickname", "x", "nickname"),
        ("groom.nickname", "x", "groom.nickname"),
    ],
)
def test_create_validation(
    api: TestClient, payload: Payload, path: str, value: Any, field: str
) -> None:
    response = api.post(URL, json=_with(payload(), path, value))
    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM
    assert field in _fields(response)
    assert api.get(URL).json()["items"] == []


def test_validation_errors_do_not_echo_submitted_values(api: TestClient, payload: Payload) -> None:
    data = _with(payload(), "groom.cpf", "999.999.999-99")
    _with(data, "bride.full_name", "Nome Secreto " + "x" * 200)
    response = api.post(URL, json=data)
    assert response.status_code == 422
    assert "999.999.999-99" not in response.text
    assert "Nome Secreto" not in response.text


def test_blank_optional_fields_are_treated_as_absent(api: TestClient, payload: Payload) -> None:
    data = _with(payload(), "event.venue_address", "")
    _with(data, "event.coverage_end", "   ")
    body = _create(api, lambda: data)
    assert body["event"]["venue_address"] is None
    assert body["event"]["coverage_end"] is None


def test_rejected_requests_are_audited_without_values(api: TestClient, payload: Payload) -> None:
    api.post(URL, json=payload(couple_address=""))
    with api.app.state.session_factory() as session:
        event = session.scalars(
            select(AuditEvent).where(AuditEvent.action == "request.rejected")
        ).one()
    assert event.outcome == "failure"
    assert event.details == {"route": "POST /api/v1/contracts", "fields": ["couple_address"]}


def test_get_returns_full_cpf_and_etag(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.get(f"{URL}/{created['id']}")
    assert response.status_code == 200
    assert response.headers["ETag"] == '"1"'
    assert response.json() == created


def test_list_masks_cpfs_and_paginates(api: TestClient, payload: Payload) -> None:
    ids = [
        _create(api, payload, event={"date": f"202{year}-01-01", "venue_name": "Igreja"})["id"]
        for year in (7, 8, 9)
    ]
    first = api.get(URL, params={"limit": 2}).json()
    assert [item["id"] for item in first["items"]] == [ids[2], ids[1]]
    assert first["items"][0]["groom"]["cpf"] == "***.***.***-09"
    assert first["next_cursor"]
    second = api.get(URL, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert [item["id"] for item in second["items"]] == [ids[0]]
    assert second["next_cursor"] is None


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"cursor": "garbage"}, "cursor"),
        ({"limit": 0}, "query.limit"),
        ({"limit": 101}, "query.limit"),
    ],
)
def test_list_rejects_bad_parameters(
    api: TestClient, params: dict[str, Any], field: str
) -> None:
    response = api.get(URL, params=params)
    assert response.status_code == 422
    assert field in _fields(response)


def test_unknown_and_malformed_ids(api: TestClient) -> None:
    missing = f"{URL}/{uuid4()}"
    assert api.get(missing).status_code == 404
    assert api.patch(missing, json={}, headers={"If-Match": '"1"'}).status_code == 404
    assert api.delete(missing).status_code == 404
    assert api.post(f"{missing}/restore").status_code == 404
    assert api.get(f"{missing}/pdf").status_code == 404
    assert api.get(f"{URL}/not-a-uuid").status_code == 422


def test_patch_requires_if_match(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.patch(f"{URL}/{created['id']}", json={"event": {"venue_name": "Catedral"}})
    assert response.status_code == 428
    assert response.headers["content-type"] == PROBLEM


def test_patch_merges_nested_fields_and_bumps_the_version(
    api: TestClient, payload: Payload
) -> None:
    created = _create(api, payload)
    response = api.patch(
        f"{URL}/{created['id']}",
        json={"event": {"venue_name": "Catedral"}},
        headers={"If-Match": '"1"'},
    )
    assert response.status_code == 200
    assert response.headers["ETag"] == '"2"'
    body = response.json()
    assert body["version"] == 2
    assert body["event"]["venue_name"] == "Catedral"
    assert body["event"]["date"] == "2027-03-14"
    assert body["event"]["coverage_start"] == "16:00:00"
    assert body["payment"] == created["payment"]


@pytest.mark.parametrize("if_match", ['"1"', "abc", '"0"', "*"])
def test_patch_with_a_stale_or_unreadable_version_is_refused(
    api: TestClient, payload: Payload, if_match: str
) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    api.patch(url, json={"event": {"venue_name": "Catedral"}}, headers={"If-Match": '"1"'})
    response = api.patch(
        url, json={"event": {"venue_name": "Capela"}}, headers={"If-Match": if_match}
    )
    assert response.status_code == 412
    assert api.get(url).json()["event"]["venue_name"] == "Catedral"


def test_patch_can_remove_the_discount_and_replace_items(
    api: TestClient, payload: Payload
) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    removed = api.patch(
        url, json={"payment": {"pix_discount_cents": None}}, headers={"If-Match": '"1"'}
    ).json()
    assert removed["payment"]["pix_discount_cents"] is None
    assert removed["payment"]["total_cents"] == 230000
    assert len(removed["payment"]["items"]) == 3

    replaced = api.patch(
        url,
        json={"payment": {"items": [{"description": "Pacote", "amount_cents": 100000}]}},
        headers={"If-Match": '"2"'},
    ).json()
    assert replaced["payment"]["items"] == [{"description": "Pacote", "amount_cents": 100000}]
    assert replaced["payment"]["total_cents"] == 100000


@pytest.mark.parametrize(
    ("patch", "field"),
    [
        ({"payment": {"pix_discount_cents": 99999999}}, "payment.pix_discount_cents"),
        ({"couple_address": None}, "couple_address"),
        ({"groom": None}, "groom"),
        ({"groom": {"cpf": "987.654.321-00"}}, "bride.cpf"),
        ({"nickname": "x"}, "nickname"),
    ],
)
def test_patch_validation(
    api: TestClient, payload: Payload, patch: dict[str, Any], field: str
) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    response = api.patch(url, json=patch, headers={"If-Match": '"1"'})
    assert response.status_code == 422
    assert field in _fields(response)
    assert api.get(url).json() == created


def test_empty_patch_changes_nothing(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.patch(f"{URL}/{created['id']}", json={}, headers={"If-Match": '"1"'})
    assert response.status_code == 200
    assert response.headers["ETag"] == '"1"'
    assert response.json() == created


def test_delete_and_restore(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    assert api.post(f"{url}/restore").status_code == 409

    assert api.delete(url).status_code == 204
    assert api.delete(url).status_code == 204
    assert api.get(URL).json()["items"] == []
    assert len(api.get(URL, params={"include_deleted": True}).json()["items"]) == 1
    assert api.get(url).json()["deleted_at"] is not None
    assert (
        api.patch(url, json={"event": {"venue_name": "X"}}, headers={"If-Match": '"1"'}).status_code
        == 409
    )
    assert api.get(f"{url}/pdf").status_code == 409

    restored = api.post(f"{url}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert len(api.get(URL).json()["items"]) == 1


def test_pdf_download(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.get(f"{URL}/{created['id']}/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert (
        response.headers["Content-Disposition"]
        == 'attachment; filename="contrato-joao-maria-2027-03-14.pdf"'
    )
    assert response.headers["X-Content-SHA256"] == hashlib.sha256(response.content).hexdigest()
    assert response.headers["Cache-Control"] == "no-store"
    text = "".join(
        "".join((page.extract_text() or "").split())
        for page in PdfReader(io.BytesIO(response.content)).pages
    )
    assert "JoãodaSilvaeMariaSouza" in text
    assert "R$2.000,00(doismilreais)" in text
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/api/test_contracts_api.py -q`
Expected: FAIL with `404` responses (the routes do not exist yet).

- [ ] **Step 3: Write the schemas**

Append to `backend/src/gerenciador/api/deps.py` (and add `Query` to the `fastapi` import):

```python
Limit = Annotated[int, Query(ge=1, le=100)]
```

`backend/src/gerenciador/api/v1/schemas.py`:

```python
"""Request and response models for API v1."""

import datetime as dt
from typing import Annotated, Any, Self

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, model_validator

from gerenciador.db.models import AuditEvent
from gerenciador.domain.cpf import format_cpf, mask_cpf, normalize_cpf
from gerenciador.services.client_service import ClientExport, ClientView
from gerenciador.services.contract_service import (
    ContractInput,
    ContractView,
    ItemInput,
    PersonInput,
)


def _blank_to_none(value: Any) -> Any:
    """An empty form input means the field was left out."""
    return None if isinstance(value, str) and not value.strip() else value


def _today() -> dt.date:
    return dt.date.today()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Cpf = Annotated[str, Field(max_length=20), AfterValidator(normalize_cpf)]
Name = Annotated[str, Field(min_length=1, max_length=200)]
Address = Annotated[str, Field(min_length=1, max_length=300)]
City = Annotated[str, Field(min_length=1, max_length=100)]
OptionalAddress = Annotated[str | None, BeforeValidator(_blank_to_none), Field(max_length=300)]
OptionalTime = Annotated[dt.time | None, BeforeValidator(_blank_to_none)]
Hours = Annotated[int, Field(strict=True, ge=1, le=24)]
PhotographerCount = Annotated[int, Field(strict=True, ge=1, le=10)]
Cents = Annotated[int, Field(strict=True, gt=0, le=100_000_000)]


# ---- requests -------------------------------------------------------------


class PersonIn(StrictModel):
    full_name: Name
    cpf: Cpf


class EventIn(StrictModel):
    date: dt.date
    venue_name: Name
    venue_address: OptionalAddress = None
    coverage_start: OptionalTime = None
    coverage_end: OptionalTime = None
    hours_contracted: Hours | None = None


class ItemIn(StrictModel):
    description: Name
    amount_cents: Cents


class PaymentIn(StrictModel):
    items: list[ItemIn] = Field(min_length=1, max_length=20)
    pix_discount_cents: Cents | None = None


class SigningIn(StrictModel):
    city: City = "Curitiba"
    date: dt.date = Field(default_factory=_today)


class ContractCreate(StrictModel):
    groom: PersonIn
    bride: PersonIn
    couple_address: Address
    event: EventIn
    photographer_count: PhotographerCount = 2
    payment: PaymentIn
    signing: SigningIn = Field(default_factory=SigningIn)

    def to_input(self) -> ContractInput:
        return ContractInput(
            groom=PersonInput(self.groom.full_name, self.groom.cpf),
            bride=PersonInput(self.bride.full_name, self.bride.cpf),
            couple_address=self.couple_address,
            event_date=self.event.date,
            venue_name=self.event.venue_name,
            venue_address=self.event.venue_address,
            coverage_start=self.event.coverage_start,
            coverage_end=self.event.coverage_end,
            hours_contracted=self.event.hours_contracted,
            photographer_count=self.photographer_count,
            items=[ItemInput(item.description, item.amount_cents) for item in self.payment.items],
            pix_discount_cents=self.payment.pix_discount_cents,
            signing_city=self.signing.city,
            signing_date=self.signing.date,
        )


class PersonPatch(StrictModel):
    full_name: Name | None = None
    cpf: Cpf | None = None


class EventPatch(StrictModel):
    date: dt.date | None = None
    venue_name: Name | None = None
    venue_address: OptionalAddress = None
    coverage_start: OptionalTime = None
    coverage_end: OptionalTime = None
    hours_contracted: Hours | None = None


class PaymentPatch(StrictModel):
    items: list[ItemIn] | None = Field(default=None, min_length=1, max_length=20)
    pix_discount_cents: Cents | None = None


class SigningPatch(StrictModel):
    city: City | None = None
    date: dt.date | None = None


def _merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Overlay `patch` on `base`. Nested objects merge; lists and scalars replace."""
    merged = dict(base)
    for key, value in patch.items():
        current = merged.get(key)
        if isinstance(value, dict) and isinstance(current, dict):
            merged[key] = _merge(current, value)
        else:
            merged[key] = value
    return merged


def _as_request(view: ContractView) -> dict[str, Any]:
    return {
        "groom": {"full_name": view.groom.full_name, "cpf": view.groom.cpf},
        "bride": {"full_name": view.bride.full_name, "cpf": view.bride.cpf},
        "couple_address": view.couple_address,
        "event": {
            "date": view.event_date,
            "venue_name": view.venue_name,
            "venue_address": view.venue_address,
            "coverage_start": view.coverage_start,
            "coverage_end": view.coverage_end,
            "hours_contracted": view.hours_contracted,
        },
        "photographer_count": view.photographer_count,
        "payment": {
            "items": [
                {"description": item.description, "amount_cents": item.amount_cents}
                for item in view.items
            ],
            "pix_discount_cents": view.pix_discount_cents,
        },
        "signing": {"city": view.signing_city, "date": view.signing_date},
    }


class ContractPatch(StrictModel):
    """Every field optional. Only the fields sent are changed."""

    groom: PersonPatch | None = None
    bride: PersonPatch | None = None
    couple_address: Address | None = None
    event: EventPatch | None = None
    photographer_count: PhotographerCount | None = None
    payment: PaymentPatch | None = None
    signing: SigningPatch | None = None

    def apply_to(self, view: ContractView) -> ContractCreate:
        """The contract as it would be after this patch, validated as a whole.

        Raises pydantic.ValidationError if the result is not a valid contract.
        """
        merged = _merge(_as_request(view), self.model_dump(exclude_unset=True))
        return ContractCreate.model_validate(merged)


class ClientPatch(StrictModel):
    full_name: Name | None = None
    cpf: Cpf | None = None
    address: Address | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> Self:
        if self.full_name is None and self.cpf is None and self.address is None:
            raise ValueError("informe ao menos um campo")
        return self


# ---- responses ------------------------------------------------------------


class PageOut[T](BaseModel):
    items: list[T]
    next_cursor: str | None


class ClientOut(BaseModel):
    id: str
    full_name: str | None
    cpf: str | None
    address: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    anonymised_at: dt.datetime | None

    @classmethod
    def from_view(cls, view: ClientView, *, mask: bool) -> Self:
        cpf = None
        if view.cpf is not None:
            cpf = mask_cpf(view.cpf) if mask else format_cpf(view.cpf)
        return cls(
            id=view.id,
            full_name=view.full_name,
            cpf=cpf,
            address=view.address,
            created_at=view.created_at,
            updated_at=view.updated_at,
            anonymised_at=view.anonymised_at,
        )


class EventOut(BaseModel):
    date: dt.date
    venue_name: str
    venue_address: str | None
    coverage_start: dt.time | None
    coverage_end: dt.time | None
    hours_contracted: int | None


class ItemOut(BaseModel):
    description: str
    amount_cents: int


class PaymentOut(BaseModel):
    items: list[ItemOut]
    pix_discount_cents: int | None
    total_cents: int


class SigningOut(BaseModel):
    city: str
    date: dt.date


class ContractOut(BaseModel):
    id: str
    groom: ClientOut
    bride: ClientOut
    couple_address: str | None
    event: EventOut
    photographer_count: int
    payment: PaymentOut
    signing: SigningOut
    version: int
    created_at: dt.datetime
    updated_at: dt.datetime
    deleted_at: dt.datetime | None

    @classmethod
    def from_view(cls, view: ContractView, *, mask: bool) -> Self:
        return cls(
            id=view.id,
            groom=ClientOut.from_view(view.groom, mask=mask),
            bride=ClientOut.from_view(view.bride, mask=mask),
            couple_address=view.couple_address,
            event=EventOut(
                date=view.event_date,
                venue_name=view.venue_name,
                venue_address=view.venue_address,
                coverage_start=view.coverage_start,
                coverage_end=view.coverage_end,
                hours_contracted=view.hours_contracted,
            ),
            photographer_count=view.photographer_count,
            payment=PaymentOut(
                items=[
                    ItemOut(description=item.description, amount_cents=item.amount_cents)
                    for item in view.items
                ],
                pix_discount_cents=view.pix_discount_cents,
                total_cents=view.total_cents,
            ),
            signing=SigningOut(city=view.signing_city, date=view.signing_date),
            version=view.version,
            created_at=view.created_at,
            updated_at=view.updated_at,
            deleted_at=view.deleted_at,
        )


class ClientContractRefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    contract_id: str
    role: str
    event_date: dt.date
    venue_name: str
    signing_date: dt.date
    deleted_at: dt.datetime | None


class ClientExportOut(BaseModel):
    client: ClientOut
    contracts: list[ClientContractRefOut]
    exported_at: dt.datetime

    @classmethod
    def from_export(cls, export: ClientExport) -> Self:
        return cls(
            client=ClientOut.from_view(export.client, mask=False),
            contracts=[ClientContractRefOut.model_validate(ref) for ref in export.contracts],
            exported_at=export.exported_at,
        )


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    occurred_at: dt.datetime
    actor: str
    action: str
    entity_type: str | None
    entity_id: str | None
    outcome: str
    request_id: str
    details: dict[str, Any]

    @classmethod
    def from_event(cls, event: AuditEvent) -> Self:
        return cls.model_validate(event)
```

- [ ] **Step 4: Write the router**

`backend/src/gerenciador/api/v1/contracts.py`:

```python
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from gerenciador.api.deps import Contracts, Ctx, Documents, Limit
from gerenciador.api.v1.schemas import ContractCreate, ContractOut, ContractPatch, PageOut
from gerenciador.services.contract_service import ContractView
from gerenciador.services.exceptions import ConflictError, StaleVersionError

router = APIRouter(prefix="/contracts", tags=["contracts"])


def _expected_version(if_match: str | None) -> int:
    if if_match is None:
        raise HTTPException(status_code=428, detail="If-Match header is required")
    candidate = if_match.strip().removeprefix("W/").strip('"')
    if not candidate.isdecimal():
        raise StaleVersionError
    return int(candidate)


def _respond(view: ContractView, response: Response) -> ContractOut:
    response.headers["ETag"] = f'"{view.version}"'
    return ContractOut.from_view(view, mask=False)


@router.post("", status_code=201)
def create_contract(
    body: ContractCreate, response: Response, ctx: Ctx, service: Contracts
) -> ContractOut:
    view = service.create(ctx, body.to_input())
    response.headers["Location"] = f"/api/v1/contracts/{view.id}"
    return _respond(view, response)


@router.get("")
def list_contracts(
    service: Contracts,
    limit: Limit = 20,
    cursor: str | None = None,
    include_deleted: bool = False,
) -> PageOut[ContractOut]:
    page = service.list_page(limit=limit, cursor=cursor, include_deleted=include_deleted)
    return PageOut(
        items=[ContractOut.from_view(view, mask=True) for view in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/{contract_id}")
def get_contract(contract_id: UUID, response: Response, service: Contracts) -> ContractOut:
    return _respond(service.get(str(contract_id)), response)


@router.patch("/{contract_id}")
def update_contract(
    contract_id: UUID,
    body: ContractPatch,
    response: Response,
    ctx: Ctx,
    service: Contracts,
    if_match: Annotated[str | None, Header()] = None,
) -> ContractOut:
    expected_version = _expected_version(if_match)
    current = service.get(str(contract_id))
    if current.deleted_at is not None:
        raise ConflictError("contract is deleted; restore it before editing")
    try:
        desired = body.apply_to(current)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc
    view = service.update(ctx, str(contract_id), expected_version, desired.to_input())
    return _respond(view, response)


@router.delete("/{contract_id}", status_code=204)
def delete_contract(contract_id: UUID, ctx: Ctx, service: Contracts) -> None:
    service.delete(ctx, str(contract_id))


@router.post("/{contract_id}/restore")
def restore_contract(
    contract_id: UUID, response: Response, ctx: Ctx, service: Contracts
) -> ContractOut:
    return _respond(service.restore(ctx, str(contract_id)), response)


@router.get(
    "/{contract_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def contract_pdf(contract_id: UUID, ctx: Ctx, service: Documents) -> Response:
    pdf = service.generate(ctx, str(contract_id))
    return Response(
        content=pdf.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf.filename}"',
            "X-Content-SHA256": pdf.sha256,
        },
    )
```

In `backend/src/gerenciador/api/v1/__init__.py`, import `contracts` and add:

```python
api_router.include_router(contracts.router)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/api -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add contracts API with versioned PATCH, soft delete and PDF"
```

---

### Task 13: Clients API

**Files:**
- Create: `backend/src/gerenciador/api/v1/clients.py`
- Modify: `backend/src/gerenciador/api/v1/__init__.py`
- Test: `backend/tests/api/test_clients_api.py`

**Interfaces:**
- Consumes: `Clients`, `Ctx`, `Limit` (Tasks 11–12); `ClientOut`, `ClientPatch`, `ClientExportOut`, `PageOut` (Task 12); `ClientService` (Task 7).
- Produces: routes `GET /clients`, `GET /clients/{client_id}`, `PATCH /clients/{client_id}`, `GET /clients/{client_id}/export`, `POST /clients/{client_id}/anonymise`.

- [ ] **Step 1: Write the failing test**

`backend/tests/api/test_clients_api.py`:

```python
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

CONTRACTS = "/api/v1/contracts"
CLIENTS = "/api/v1/clients"
Payload = Callable[..., dict[str, Any]]


@pytest.fixture
def contract(api: TestClient, payload: Payload) -> dict[str, Any]:
    response = api.post(CONTRACTS, json=payload())
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def test_list_masks_cpfs(api: TestClient, contract: dict[str, Any]) -> None:
    body = api.get(CLIENTS).json()
    assert {item["full_name"] for item in body["items"]} == {"João da Silva", "Maria Souza"}
    assert {item["cpf"] for item in body["items"]} == {"***.***.***-09", "***.***.***-00"}
    assert body["next_cursor"] is None


def test_list_paginates_and_rejects_bad_cursor(api: TestClient, contract: dict[str, Any]) -> None:
    first = api.get(CLIENTS, params={"limit": 1}).json()
    assert len(first["items"]) == 1
    second = api.get(CLIENTS, params={"limit": 1, "cursor": first["next_cursor"]}).json()
    assert len(second["items"]) == 1
    assert second["items"][0]["id"] != first["items"][0]["id"]
    assert api.get(CLIENTS, params={"cursor": "garbage"}).status_code == 422


def test_get_returns_full_data(api: TestClient, contract: dict[str, Any]) -> None:
    body = api.get(f"{CLIENTS}/{contract['groom']['id']}").json()
    assert body["cpf"] == "123.456.789-09"
    assert body["address"] == "Rua das Flores 100"


def test_patch_corrects_a_client(api: TestClient, contract: dict[str, Any]) -> None:
    url = f"{CLIENTS}/{contract['groom']['id']}"
    response = api.patch(url, json={"full_name": "João Souza", "cpf": "111.444.777-35"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "João Souza"
    assert response.json()["cpf"] == "111.444.777-35"
    assert api.get(f"{CONTRACTS}/{contract['id']}").json()["groom"]["full_name"] == "João Souza"


@pytest.mark.parametrize(
    "body",
    [{}, {"full_name": None}, {"cpf": "123.456.789-00"}, {"full_name": " "}, {"nickname": "x"}],
)
def test_patch_validation(api: TestClient, contract: dict[str, Any], body: dict[str, Any]) -> None:
    response = api.patch(f"{CLIENTS}/{contract['groom']['id']}", json=body)
    assert response.status_code == 422


def test_patch_to_another_clients_cpf_conflicts(api: TestClient, contract: dict[str, Any]) -> None:
    response = api.patch(
        f"{CLIENTS}/{contract['groom']['id']}", json={"cpf": "987.654.321-00"}
    )
    assert response.status_code == 409


def test_export(api: TestClient, contract: dict[str, Any]) -> None:
    body = api.get(f"{CLIENTS}/{contract['bride']['id']}/export").json()
    assert body["client"]["cpf"] == "987.654.321-00"
    assert body["client"]["address"] == "Rua das Flores 100"
    assert body["contracts"] == [
        {
            "contract_id": contract["id"],
            "role": "bride",
            "event_date": "2027-03-14",
            "venue_name": "Igreja Matriz",
            "signing_date": "2026-10-13",
            "deleted_at": None,
        }
    ]
    assert body["exported_at"]


def test_anonymise_is_refused_while_a_contract_is_active(
    api: TestClient, contract: dict[str, Any]
) -> None:
    response = api.post(f"{CLIENTS}/{contract['groom']['id']}/anonymise")
    assert response.status_code == 409
    assert api.get(f"{CLIENTS}/{contract['groom']['id']}").json()["full_name"] == "João da Silva"


def test_anonymise_after_the_contract_is_deleted(
    api: TestClient, contract: dict[str, Any]
) -> None:
    client_url = f"{CLIENTS}/{contract['groom']['id']}"
    contract_url = f"{CONTRACTS}/{contract['id']}"
    api.delete(contract_url)

    response = api.post(f"{client_url}/anonymise")
    assert response.status_code == 200
    body = response.json()
    assert (body["full_name"], body["cpf"], body["address"]) == (None, None, None)
    assert body["anonymised_at"] is not None

    assert api.post(f"{client_url}/anonymise").status_code == 409
    assert api.patch(client_url, json={"full_name": "X"}).status_code == 409
    assert api.post(f"{contract_url}/restore").status_code == 409
    assert api.get(contract_url).json()["groom"]["full_name"] is None


def test_unknown_and_malformed_ids(api: TestClient) -> None:
    missing = f"{CLIENTS}/{uuid4()}"
    assert api.get(missing).status_code == 404
    assert api.patch(missing, json={"full_name": "X"}).status_code == 404
    assert api.get(f"{missing}/export").status_code == 404
    assert api.post(f"{missing}/anonymise").status_code == 404
    assert api.get(f"{CLIENTS}/not-a-uuid").status_code == 422
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/api/test_clients_api.py -q`
Expected: FAIL with `404` responses.

- [ ] **Step 3: Write the router**

`backend/src/gerenciador/api/v1/clients.py`:

```python
from uuid import UUID

from fastapi import APIRouter

from gerenciador.api.deps import Clients, Ctx, Limit
from gerenciador.api.v1.schemas import ClientExportOut, ClientOut, ClientPatch, PageOut

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("")
def list_clients(
    service: Clients, limit: Limit = 20, cursor: str | None = None
) -> PageOut[ClientOut]:
    page = service.list_page(limit=limit, cursor=cursor)
    return PageOut(
        items=[ClientOut.from_view(view, mask=True) for view in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/{client_id}")
def get_client(client_id: UUID, service: Clients) -> ClientOut:
    return ClientOut.from_view(service.get(str(client_id)), mask=False)


@router.patch("/{client_id}")
def update_client(client_id: UUID, body: ClientPatch, ctx: Ctx, service: Clients) -> ClientOut:
    view = service.update(
        ctx, str(client_id), full_name=body.full_name, cpf=body.cpf, address=body.address
    )
    return ClientOut.from_view(view, mask=False)


@router.get("/{client_id}/export")
def export_client(client_id: UUID, ctx: Ctx, service: Clients) -> ClientExportOut:
    return ClientExportOut.from_export(service.export(ctx, str(client_id)))


@router.post("/{client_id}/anonymise")
def anonymise_client(client_id: UUID, ctx: Ctx, service: Clients) -> ClientOut:
    return ClientOut.from_view(service.anonymise(ctx, str(client_id)), mask=False)
```

In `backend/src/gerenciador/api/v1/__init__.py`, import `clients` and add:

```python
api_router.include_router(clients.router)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/api -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add clients API with export and anonymise"
```

---

### Task 14: Audit API

**Files:**
- Create: `backend/src/gerenciador/api/v1/audit.py`
- Modify: `backend/src/gerenciador/api/v1/__init__.py`
- Test: `backend/tests/api/test_audit_api.py`

**Interfaces:**
- Consumes: `Audit`, `Limit` (Tasks 11–12); `AuditEventOut`, `PageOut` (Task 12); `AuditService.get`, `AuditService.list_page` (Task 6).
- Produces: routes `GET /audit-events` (query parameters `limit`, `cursor`, `action`, `entity_id`, `from`, `to`) and `GET /audit-events/{event_id}`. There are no write routes.

- [ ] **Step 1: Write the failing test**

`backend/tests/api/test_audit_api.py`:

```python
import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

CONTRACTS = "/api/v1/contracts"
AUDIT = "/api/v1/audit-events"
Payload = Callable[..., dict[str, Any]]


@pytest.fixture
def contract(api: TestClient, payload: Payload) -> dict[str, Any]:
    response = api.post(CONTRACTS, json=payload())
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def test_actions_appear_newest_first(api: TestClient, contract: dict[str, Any]) -> None:
    pdf = api.get(f"{CONTRACTS}/{contract['id']}/pdf")
    api.delete(f"{CONTRACTS}/{contract['id']}")

    events = api.get(AUDIT).json()["items"]
    assert [event["action"] for event in events] == [
        "contract.deleted",
        "contract.pdf_generated",
        "contract.created",
        "client.created",
        "client.created",
    ]
    assert all(event["actor"] == "owner" for event in events)
    assert all(event["outcome"] == "success" for event in events)
    generated = events[1]
    assert generated["entity_type"] == "contract"
    assert generated["entity_id"] == contract["id"]
    assert generated["details"] == {"version": 1, "sha256": pdf.headers["X-Content-SHA256"]}
    assert generated["request_id"] == pdf.headers["X-Request-ID"]


def test_audit_trail_holds_no_personal_values(api: TestClient, contract: dict[str, Any]) -> None:
    api.patch(f"/api/v1/clients/{contract['groom']['id']}", json={"full_name": "João Souza"})
    api.post(CONTRACTS, json={"groom": {"full_name": "Nome Rejeitado", "cpf": "000"}})
    text = api.get(AUDIT).text
    for needle in (
        "João",
        "Maria",
        "Souza",
        "Rejeitado",
        "12345678909",
        "123.456.789-09",
        "98765432100",
        "Flores",
    ):
        assert needle not in text


def test_filters(api: TestClient, contract: dict[str, Any]) -> None:
    by_action = api.get(AUDIT, params={"action": "client.created"}).json()["items"]
    assert len(by_action) == 2

    by_entity = api.get(AUDIT, params={"entity_id": contract["id"]}).json()["items"]
    assert [event["action"] for event in by_entity] == ["contract.created"]

    tomorrow = (dt.datetime.now(dt.UTC) + dt.timedelta(days=1)).isoformat()
    assert api.get(AUDIT, params={"from": tomorrow}).json()["items"] == []
    assert len(api.get(AUDIT, params={"to": tomorrow}).json()["items"]) == 3


def test_pagination(api: TestClient, contract: dict[str, Any]) -> None:
    first = api.get(AUDIT, params={"limit": 2}).json()
    assert len(first["items"]) == 2
    second = api.get(AUDIT, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None


@pytest.mark.parametrize(
    "params",
    [{"cursor": "abc"}, {"limit": 0}, {"from": "2026-10-13T12:00:00"}, {"to": "yesterday"}],
)
def test_bad_parameters(api: TestClient, params: dict[str, Any]) -> None:
    assert api.get(AUDIT, params=params).status_code == 422


def test_get_one_event(api: TestClient, contract: dict[str, Any]) -> None:
    newest = api.get(AUDIT).json()["items"][0]
    assert api.get(f"{AUDIT}/{newest['id']}").json() == newest
    assert api.get(f"{AUDIT}/999999").status_code == 404
    assert api.get(f"{AUDIT}/abc").status_code == 422


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_the_audit_trail_cannot_be_written_through_the_api(
    api: TestClient, contract: dict[str, Any], method: str
) -> None:
    newest = api.get(AUDIT).json()["items"][0]
    assert getattr(api, method)(f"{AUDIT}/{newest['id']}").status_code == 405
    assert api.get(f"{AUDIT}/{newest['id']}").json() == newest
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/api/test_audit_api.py -q`
Expected: FAIL with `404` responses.

- [ ] **Step 3: Write the router**

`backend/src/gerenciador/api/v1/audit.py`:

```python
"""Read-only access to the audit trail."""

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import AwareDatetime

from gerenciador.api.deps import Audit, Limit
from gerenciador.api.v1.schemas import AuditEventOut, PageOut

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("")
def list_audit_events(
    service: Audit,
    limit: Limit = 20,
    cursor: str | None = None,
    action: str | None = None,
    entity_id: str | None = None,
    occurred_from: Annotated[AwareDatetime | None, Query(alias="from")] = None,
    occurred_to: Annotated[AwareDatetime | None, Query(alias="to")] = None,
) -> PageOut[AuditEventOut]:
    page = service.list_page(
        limit=limit,
        cursor=cursor,
        action=action,
        entity_id=entity_id,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
    )
    return PageOut(
        items=[AuditEventOut.from_event(event) for event in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/{event_id}")
def get_audit_event(event_id: int, service: Audit) -> AuditEventOut:
    return AuditEventOut.from_event(service.get(event_id))
```

In `backend/src/gerenciador/api/v1/__init__.py`, import `audit` and add:

```python
api_router.include_router(audit.router)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/api -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add read-only audit API"
```

---

### Task 15: Privacy guarantees

This task adds tests that prove guarantees earlier tasks were built to meet. No production code is expected to change.

**Files:**
- Test: `backend/tests/test_privacy.py`

**Interfaces:**
- Consumes: `create_app`, `Settings`, the `api`, `payload` and `settings` fixtures.

- [ ] **Step 1: Write the tests**

`backend/tests/test_privacy.py`:

```python
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"
CONTRACTS = "/api/v1/contracts"
CLIENTS = "/api/v1/clients"
Payload = Callable[..., dict[str, Any]]

CPF_AND_ADDRESS = (
    "12345678909",
    "123.456.789-09",
    "98765432100",
    "987.654.321-00",
    "Rua das Flores 100",
)


def _disk(settings: Settings) -> bytes:
    """Every byte the database has on disk, including journal files."""
    folder: Path = settings.database_path.parent
    return b"".join(path.read_bytes() for path in sorted(folder.iterdir()) if path.is_file())


def test_cpf_and_address_are_never_stored_in_plain_text(
    api: TestClient, payload: Payload, settings: Settings
) -> None:
    assert api.post(CONTRACTS, json=payload()).status_code == 201
    raw = _disk(settings)
    assert "João da Silva".encode() in raw
    for needle in CPF_AND_ADDRESS:
        assert needle.encode() not in raw


def test_anonymising_removes_the_person_from_disk(
    api: TestClient, payload: Payload, settings: Settings
) -> None:
    contract = api.post(CONTRACTS, json=payload()).json()
    api.delete(f"{CONTRACTS}/{contract['id']}")
    assert api.post(f"{CLIENTS}/{contract['groom']['id']}/anonymise").status_code == 200

    raw = _disk(settings)
    assert "João da Silva".encode() not in raw
    assert "João".encode() not in raw
    assert "Maria Souza".encode() in raw


def test_logs_contain_no_personal_data(
    settings: Settings, payload: Payload, caplog: pytest.LogCaptureFixture
) -> None:
    # INFO makes SQLAlchemy log every statement. It must be set before the engine
    # is created. DEBUG is deliberately not covered: at DEBUG, SQLAlchemy logs
    # result rows, which include client names. Never enable it in production.
    caplog.set_level(logging.INFO)
    caplog.set_level(logging.INFO, logger="sqlalchemy.engine")

    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        contract = client.post(CONTRACTS, json=payload()).json()
        client.get(f"{CONTRACTS}/{contract['id']}/pdf")
        client.get(f"{CLIENTS}/{contract['groom']['id']}/export")
        client.post(CONTRACTS, json=payload(couple_address=""))

    text = caplog.text
    assert "INSERT INTO clients" in text
    for needle in (*CPF_AND_ADDRESS, "João", "Maria", "Souza"):
        assert needle not in text
```

- [ ] **Step 2: Run the tests**

Run: `uv run pytest tests/test_privacy.py -q`
Expected: PASS.

If a test fails, stop and report which needle was found and where. These are the guarantees the design promises to clients; do not weaken an assertion to make it pass. The mechanisms that should make them hold are field encryption (Task 5), `PRAGMA secure_delete=ON` and `hide_parameters=True` (Task 6).

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "test: prove personal data stays out of disk plaintext and logs"
```

---

### Task 16: Running, serving the frontend, and project tooling

**Files:**
- Create: `backend/src/gerenciador/__main__.py`
- Create: `Makefile`, `README.md`, `.pre-commit-config.yaml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`
- Test: `backend/tests/test_entrypoint.py`

**Interfaces:**
- Consumes: `create_app`, `get_settings`, `Settings`.
- Produces: `python -m gerenciador` starts the server on `settings.host:settings.port`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_entrypoint.py`:

```python
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from gerenciador import __main__ as entrypoint
from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"


def test_main_runs_uvicorn_on_the_configured_loopback_address(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(entrypoint, "get_settings", lambda: settings)
    monkeypatch.setattr(
        entrypoint.uvicorn, "run", lambda app, **kwargs: calls.append({"app": app, **kwargs})
    )
    entrypoint.main()
    assert calls == [
        {"app": "gerenciador.main:create_app", "factory": True, "host": "127.0.0.1", "port": 8000}
    ]


def test_built_frontend_is_served_with_a_strict_csp(settings: Settings, tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>app</title>", encoding="utf-8")
    app = create_app(settings.model_copy(update={"frontend_dist": dist}))
    with TestClient(app, base_url=BASE_URL) as client:
        page = client.get("/")
        health = client.get("/api/v1/health")
    assert page.status_code == 200
    assert "<title>app</title>" in page.text
    assert page.headers["Content-Security-Policy"] == (
        "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    )
    assert health.json() == {"status": "ok"}


def test_no_frontend_build_means_no_root_page(api: TestClient) -> None:
    assert api.get("/").status_code == 404
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_entrypoint.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'gerenciador.__main__'`

- [ ] **Step 3: Write the entry point**

`backend/src/gerenciador/__main__.py`:

```python
"""Start the server: `uv run python -m gerenciador`."""

import uvicorn

from gerenciador.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "gerenciador.main:create_app", factory=True, host=settings.host, port=settings.port
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_entrypoint.py -q && uv run ruff check . && uv run mypy src`
Expected: PASS

- [ ] **Step 5: Add the project tooling**

`Makefile` at the repository root (indent recipe lines with tabs):

```make
.PHONY: install run check

install:
	cd backend && uv sync

run:
	cd backend && uv run python -m gerenciador

check:
	cd backend && uv run ruff format --check .
	cd backend && uv run ruff check .
	cd backend && uv run mypy src
	cd backend && uv run pytest --cov=gerenciador --cov-report=term-missing --cov-fail-under=90
	cd backend && uv run coverage report --include="*/gerenciador/domain/*" --fail-under=100
	cd backend && uv run pip-audit
```

`.pre-commit-config.yaml` at the repository root:

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.9
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks
```

Then pin both hooks to their latest releases and install them:

```bash
uv run --project backend pre-commit autoupdate && uv run --project backend pre-commit install
```

Run that from the repository root.

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Install WeasyPrint system libraries
        run: sudo apt-get update && sudo apt-get install -y libpango-1.0-0 libpangoft2-1.0-0
      - uses: astral-sh/setup-uv@v5
      - run: make install
      - run: make check
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: uv
    directory: /backend
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

`README.md` at the repository root:

````markdown
# Gerenciador Fotografia

Generates wedding photography contracts as PDF from a form, stores them, and
keeps an audit trail of every action. Runs on your own machine only.

## Setup

Requires macOS with [Homebrew](https://brew.sh) and [uv](https://docs.astral.sh/uv/).

```bash
brew install pango
make install
cp .env.example .env
cd backend && uv run python -m gerenciador.keygen
```

Paste the two generated lines into `.env` and fill in your own details.

## Run

```bash
make run
```

The API is at <http://127.0.0.1:8000/api/v1> and its documentation at
<http://127.0.0.1:8000/docs>. The server refuses to start on any address other
than `127.0.0.1` or `localhost`, because it has no login.

Writes need an `Origin` header that matches the address you call. Browsers send
it. With curl, add `-H "Origin: http://127.0.0.1:8000"`.

## Check

```bash
make check
```

Runs formatting, lint, types, tests with coverage gates, and a dependency audit.

## Backups

Back up two things, and keep them in different places:

1. `data/gerenciador.db`: every contract, client and audit event.
2. `FIELD_ENCRYPTION_KEY` and `CPF_LOOKUP_KEY` from `.env`.

CPFs and addresses are encrypted with those keys. If you lose the keys, that
data cannot be recovered. Anyone who has both the database and the keys can
read everything.

## Personal data

Client name, CPF and address live only in the `clients` table. Through the API
you can export everything held about a person, correct it, or anonymise it
(`/docs`, under "clients"). Anonymising is permanent and is refused while the
person has a contract that is not deleted.

How long to keep a finished contract before anonymising is a legal decision.
This software provides the technical measures, not legal advice.

Logs contain no personal data at the default level. Do not turn on DEBUG
logging for `sqlalchemy.engine`: at that level it logs result rows, which
include client names.

## The contract template

`base_contract/contract_template.md` is a Jinja2 template in Markdown. Edit the
clauses there. Keep the `{{ placeholders }}` and the `{% ... %}` lines intact.
````

- [ ] **Step 6: Run everything**

Run from the repository root: `make check`
Expected: every command succeeds, overall coverage is at least 90%, and `gerenciador/domain` is at 100%. If `pip-audit` reports a vulnerability, report the package and advisory; do not ignore it silently.

- [ ] **Step 7: Start the server once by hand**

```bash
cp .env.example .env
```

Fill `.env` with test values (`CONTRACTOR_CPF=111.444.777-35`) and two generated keys, then run `make run` and, in another terminal:

```bash
curl -s http://127.0.0.1:8000/api/v1/health
```

Expected: `{"status":"ok"}`. Stop the server. Then set `HOST=0.0.0.0` in `.env` and run `make run` again. Expected: it exits with a validation error that says "no authentication". Remove the `HOST` line afterwards.

- [ ] **Step 8: Commit**

```bash
git add Makefile README.md .pre-commit-config.yaml .github backend && git commit -m "chore: add entry point, tooling, CI and documentation"
```

---

## What comes next

The frontend plan (spec section 7): a React, TypeScript and Vite app in `frontend/`, with API types generated from this backend's `/openapi.json`. Two constraints from this plan carry over to it:

- The app is served under the Content Security Policy `default-src 'self'`, so it cannot use inline scripts, inline `style` attributes, or assets from other origins.
- Writes must come from the same origin as the API. In development, the Vite proxy must forward `/api` without changing the `Host` header.
