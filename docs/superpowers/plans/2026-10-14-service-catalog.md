# Service Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contract items are picked from a catalog of services kept in the database, managed on a new "Serviços" screen, with some services marked as pre-wedding.

**Architecture:** A new `services` table; `contract_items` gains a non-null `service_id` while keeping its own `description`/`amount_cents` copy. The contract service resolves `{service_id, amount_cents}` items, reusing an existing item row (and its wording) when the service was already on the contract. A `CatalogService` and `/api/v1/services` router manage the catalog. The frontend gains a services page and a service dropdown per contract item.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (SQLite, batch mode), Pydantic 2, pytest · React 19, TanStack Query 5, React Hook Form 7, openapi-fetch, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-service-catalog-design.md`

## Global Constraints

- Branch: `feat/service-catalog`, based on `main`. Commit after every task; end each commit message with the two attribution lines from the session (`Co-Authored-By: …` and `Claude-Session: …`).
- Backend test command, written `PYTEST` below: `cd backend && DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib" uv run python -m pytest` (run from the repository root).
- Frontend test command, written `VITEST` below: `cd frontend && npx vitest run`.
- Service `name`: 1–200 characters, trimmed, no Unicode category Cc characters (reuse the `Name` type in `schemas.py`). Unique, ignoring case (`str.casefold()`), among services that are not archived.
- `default_price_cents`: integer > 0, at most 100,000,000 (reuse the `Cents` type).
- `is_prewedding`: boolean, default false; several services may be marked.
- A contract has at most one item per service: service-layer check plus unique constraint `uq_contract_items_service` on `(contract_id, service_id)`.
- Rule 3.3: an incoming item whose `service_id` was already on the contract keeps that item's `description`; otherwise `description` = the service's current `name`.
- Item validation errors are `422` on `payment.items.<n>.service_id` with these messages: `serviço não encontrado`, `serviço repetido no contrato`, `serviço arquivado`.
- Audit actions `service.created`, `service.updated`, `service.archived`, `service.restored`; `details` holds only `version` and, for updates, `fields` (names). Never names or prices.
- `If-Match`: missing → `428`, stale or malformed → `412`, as for contracts.
- `409` for name conflicts (create, rename, restore) and for archive/restore when already in that state. `404` for an unknown id.
- `GET /api/v1/services` returns a plain JSON array sorted by name, ignoring case and accents. It is not paginated.
- After any backend route or schema change: `make openapi` and commit `openapi.json`. Run `make api-types` and commit `frontend/src/api/schema.d.ts` in Task 4. `make check` fails on stale API types between Task 1 and Task 4. Until then, verify with `make check-backend`.
- UI copy is Portuguese. Code, comments and commit messages are English.
- `make check` and `make e2e` must pass at the end.

## Review Focus

1. **Old contract whose item uses a since-archived service.** Saving an unrelated change must succeed and keep the item. The form must show it as "‹description› (arquivado)", and other rows must not be able to pick it. Pinned in Task 1 (`test_archived_service_already_on_the_contract_is_kept`) and Task 4 (`an old contract keeps its archived service`).
2. **Replacing items that share a service with the current list,** e.g. `[A, B]` → `[B, C]` or `[A, B]` → `[B, A]`. The unique constraint must not fire mid-flush, and B keeps its wording. Pinned in Task 1 (`test_reordering_and_swapping_items_reuses_rows`).
3. **Case-only name collisions** ("Álbum" vs "ÁLBUM"), including when restoring an archived service whose name was reused meanwhile. Pinned in Task 2 (`test_names_collide_ignoring_case`, `test_restore_refuses_a_name_taken_meanwhile`).
4. **Migration on a fresh database, and on soft-deleted contracts.** It must create an empty catalog in the first case and include deleted contracts' items in the second. Pinned in Task 1 (`test_empty_database_gets_an_empty_catalog`, `test_one_service_per_description_with_newest_amount`).
5. **A `service_id` that is not a UUID, or a blank selection.** It must be a `422` on that row's field, never a 500, and the form must say "selecione um serviço". Pinned in Task 1 (`test_create_validation` cases) and Task 4 (`formModel` test).

---

## File Structure

Backend (`backend/`):

- `src/gerenciador/domain/text.py` (create): `fold()`, a case- and accent-insensitive key for sorting.
- `src/gerenciador/db/models.py` (modify): `Service` model; `ContractItem.service_id`, `.service`, and the unique constraint.
- `migrations/versions/0002_service_catalog.py` (create): table, data migration, constraint.
- `src/gerenciador/db/migrate.py` (modify): `migration_config(url)` helper so tests can upgrade to a given revision.
- `src/gerenciador/repositories/service_repository.py` (create): `ServiceRepository`.
- `src/gerenciador/services/contract_service.py` (modify): new `ItemInput`/`ItemView`, item resolution, `has_prewedding`.
- `src/gerenciador/services/catalog_service.py` (create): `CatalogService`.
- `src/gerenciador/services/exceptions.py` (modify): `StaleVersionError(entity)`.
- `src/gerenciador/api/errors.py` (modify): the 412 message names the entity.
- `src/gerenciador/api/v1/versioning.py` (create): `expected_version()`, moved from `contracts.py`.
- `src/gerenciador/api/v1/services.py` (create): router.
- `src/gerenciador/api/v1/schemas.py`, `api/v1/contracts.py`, `api/v1/__init__.py`, `api/deps.py` (modify).
- Tests:
  - `tests/conftest.py`: `catalog` fixture, new item shape.
  - `tests/db/test_migration_0002.py` (create).
  - `tests/db/test_database.py`.
  - `tests/domain/test_text.py` (create).
  - `tests/services/test_catalog_service.py` (create).
  - `tests/services/test_contract_service.py`.
  - `tests/services/test_contract_renderer.py`.
  - `tests/api/test_services_api.py` (create).
  - `tests/api/test_contracts_api.py`.
  - `tests/test_privacy.py`.

Frontend (`frontend/`):

- `src/api/schema.d.ts` (regenerated).
- `src/api/client.ts`, `src/api/keys.ts` (modify).
- `src/api/services.ts` (create).
- `src/domain/fieldRules.ts` (create): `REQUIRED`, `textError`, `amountError`, moved out of `formModel.ts`.
- `src/ui/Select.tsx`, `src/ui/Select.module.css` (create); `src/ui/index.ts` (modify).
- `src/features/contracts/serviceOptions.ts` (+ test) (create).
- `src/features/contracts/sections/ServiceField.tsx` (create).
- `src/features/contracts/formModel.ts`, `sections/PaymentSection.tsx`, `ContractForm.tsx`, `EditContract.tsx` (modify).
- `src/features/services/ServiceListPage.tsx`, `ServiceListPage.module.css`, `ServiceDialog.tsx`, `serviceForm.ts`, `messages.ts`, and their tests (create).
- `src/app/routes.tsx` (modify).
- `src/test/fixtures.ts`, `src/test/server.ts` (modify).
- `e2e/helpers.ts` (modify), `e2e/services.spec.ts` (create).
- `README.md` (modify).

---

### Task 1: Contract items reference catalog services (backend data layer)

Adds the `services` table and migration, links every contract item to a service, and changes the contract item API shape. This task leaves no catalog-management endpoints; tests seed services directly.

**Files:**
- Create:
  - `backend/src/gerenciador/domain/text.py`
  - `backend/tests/domain/test_text.py`
  - `backend/migrations/versions/0002_service_catalog.py`
  - `backend/tests/db/test_migration_0002.py`
  - `backend/src/gerenciador/repositories/service_repository.py`
- Modify:
  - `backend/src/gerenciador/db/models.py`
  - `backend/src/gerenciador/db/migrate.py`
  - `backend/src/gerenciador/services/contract_service.py`
  - `backend/src/gerenciador/api/v1/schemas.py`
  - `backend/tests/conftest.py`
  - `backend/tests/db/test_database.py`
  - `backend/tests/services/test_contract_service.py`
  - `backend/tests/services/test_contract_renderer.py`
  - `backend/tests/api/test_contracts_api.py`
  - `openapi.json`

**Interfaces:**
- Produces:
  - `gerenciador.domain.text.fold(text: str) -> str`.
  - `gerenciador.db.models.Service`, with columns `id, name, default_price_cents, is_prewedding, archived_at, version, created_at, updated_at`.
  - `ContractItem.service_id: str` and `ContractItem.service: Service`.
  - `gerenciador.db.migrate.migration_config(url: str) -> alembic.config.Config`.
  - `ServiceRepository(session)` with `add(service) -> None`, `get(service_id) -> Service | None`, `get_many(ids: Collection[str]) -> dict[str, Service]` and `all(*, include_archived: bool) -> list[Service]`.
  - `ItemInput(service_id: str, amount_cents: int)` and `ItemView(service_id: str, description: str, amount_cents: int)`.
  - `ContractService.has_prewedding(contract_id: str) -> bool`.
  - Test fixture `catalog` (a `dict[str, str]` from key to service id). Its keys are `"second"`, `"ceremony"`, `"dinner"`, `"prewedding"` and `"archived"`. Module constant `tests.conftest.SERVICE_IDS` holds the same mapping.

- [ ] **Step 1: Write the failing test for `fold`**

`backend/tests/domain/test_text.py`:

```python
import pytest

from gerenciador.domain.text import fold


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Pré-Wedding", "pre-wedding"),
        ("ÁLBUM", "album"),
        ("Diária", "diaria"),
        ("straße", "strasse"),
        ("", ""),
    ],
)
def test_fold_ignores_case_and_accents(text: str, expected: str) -> None:
    assert fold(text) == expected
```

- [ ] **Step 2: Run it to verify it fails**

Run: `PYTEST tests/domain/test_text.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'gerenciador.domain.text'`.

- [ ] **Step 3: Implement `fold`**

`backend/src/gerenciador/domain/text.py`:

```python
"""Text keys for comparing and sorting names the way a person reads them."""

import unicodedata


def fold(text: str) -> str:
    """Lower case without accents: "Pré-Wedding" and "pre-wedding" fold alike."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()
```

- [ ] **Step 4: Run it to verify it passes**

Run: `PYTEST tests/domain/test_text.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Add `migration_config` to `migrate.py`**

Replace `run_migrations` in `backend/src/gerenciador/db/migrate.py` with:

```python
def migration_config(url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", url)
    return config


def run_migrations(url: str) -> None:
    command.upgrade(migration_config(url), "head")
```

- [ ] **Step 6: Write the failing migration tests**

`backend/tests/db/test_migration_0002.py`:

```python
"""Migration 0002 turns existing free-text items into catalog services."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, create_engine, inspect, text

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0001")
    engine = create_engine(url)
    yield config, engine
    engine.dispose()


def _seed(
    conn: Connection,
    contract_id: str,
    created_at: str,
    items: list[tuple[str, int]],
    *,
    deleted_at: str | None = None,
) -> None:
    for role in ("g", "b"):
        conn.execute(
            text(
                "INSERT INTO clients (id, full_name, created_at, updated_at)"
                " VALUES (:id, 'Pessoa', :t, :t)"
            ),
            {"id": f"{contract_id}{role}", "t": created_at},
        )
    conn.execute(
        text(
            "INSERT INTO contracts (id, groom_id, bride_id, event_date, venue_name,"
            " photographer_count, signing_city, signing_date, version, created_at,"
            " updated_at, deleted_at) VALUES (:id, :g, :b, '2027-03-14', 'Igreja', 2,"
            " 'Curitiba', '2026-10-13', 1, :t, :t, :d)"
        ),
        {
            "id": contract_id,
            "g": f"{contract_id}g",
            "b": f"{contract_id}b",
            "t": created_at,
            "d": deleted_at,
        },
    )
    for position, (description, amount) in enumerate(items):
        conn.execute(
            text(
                "INSERT INTO contract_items (id, contract_id, position, description,"
                " amount_cents) VALUES (:id, :c, :p, :d, :a)"
            ),
            {
                "id": f"{contract_id}i{position}",
                "c": contract_id,
                "p": position,
                "d": description,
                "a": amount,
            },
        )


def _services(engine: Engine) -> dict[str, tuple[int, bool, int, object]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT name, default_price_cents, is_prewedding, version, archived_at FROM services"
            )
        ).all()
    return {
        name: (price, bool(flag), version, archived)
        for name, price, flag, version, archived in rows
    }


def test_one_service_per_description_with_newest_amount(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(
            conn,
            "c1",
            "2026-01-01 10:00:00",
            [("Cerimônia", 100000), ("Ensaio de Pré-Wedding", 40000)],
        )
        _seed(
            conn,
            "c2",
            "2026-06-01 10:00:00",
            [("Cerimônia", 120000)],
            deleted_at="2026-07-01 10:00:00",
        )
    command.upgrade(config, "head")

    assert _services(engine) == {
        "Cerimônia": (120000, False, 1, None),
        "Ensaio de Pré-Wedding": (40000, True, 1, None),
    }
    with engine.connect() as conn:
        linked = conn.execute(
            text(
                "SELECT i.description, s.name FROM contract_items i"
                " JOIN services s ON s.id = i.service_id"
            )
        ).all()
    assert len(linked) == 3
    assert all(description == name for description, name in linked)


def test_prewedding_guess_ignores_case_and_accents(db: tuple[Config, Engine]) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(
            conn,
            "c1",
            "2026-01-01 10:00:00",
            [("PRE-WEDDING curto", 1), ("pré-wedding", 2), ("Casamento", 3)],
        )
    command.upgrade(config, "head")
    flags = {name: flag for name, (_, flag, _, _) in _services(engine).items()}
    assert flags == {"PRE-WEDDING curto": True, "pré-wedding": True, "Casamento": False}


def test_empty_database_gets_an_empty_catalog(db: tuple[Config, Engine]) -> None:
    config, engine = db
    command.upgrade(config, "head")
    assert _services(engine) == {}


def test_repeated_description_stops_and_names_the_contract(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(conn, "c1", "2026-01-01 10:00:00", [("Cerimônia", 1), ("Cerimônia", 2)])
    with pytest.raises(RuntimeError, match="c1"):
        command.upgrade(config, "head")
    assert "services" not in inspect(engine).get_table_names()


def test_downgrade_keeps_items_intact(db: tuple[Config, Engine]) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(conn, "c1", "2026-01-01 10:00:00", [("Cerimônia", 100000)])
    command.upgrade(config, "head")
    command.downgrade(config, "0001")

    inspector = inspect(engine)
    assert "services" not in inspector.get_table_names()
    assert "service_id" not in {
        c["name"] for c in inspector.get_columns("contract_items")
    }
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT description, amount_cents FROM contract_items")
        ).all()
    assert [tuple(row) for row in rows] == [("Cerimônia", 100000)]
```

- [ ] **Step 7: Run them to verify they fail**

Run: `PYTEST tests/db/test_migration_0002.py -v`
Expected: FAIL. `command.upgrade(config, "head")` stops at 0001, so the queries on `services` raise `OperationalError: no such table: services`.

- [ ] **Step 8: Write migration 0002**

`backend/migrations/versions/0002_service_catalog.py`:

```python
"""service catalog: services table, contract items linked to a service

Revision ID: 0002
Revises: 0001
"""

import datetime as dt
import unicodedata
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _fold(text: str) -> str:
    # Copied, not imported, so this migration never changes when app code does.
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def upgrade() -> None:
    conn = op.get_bind()
    # Checked before any change: SQLite DDL is not rolled back if this fails later.
    repeated = conn.execute(
        sa.text(
            "SELECT contract_id FROM contract_items GROUP BY contract_id, description"
            " HAVING COUNT(*) > 1 ORDER BY contract_id LIMIT 1"
        )
    ).scalar()
    if repeated is not None:
        raise RuntimeError(
            f"contract {repeated} has two items with the same description. Give them"
            " different descriptions, or merge them, and run the migration again."
        )

    op.create_table(
        "services",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("default_price_cents", sa.Integer, nullable=False),
        sa.Column("is_prewedding", sa.Boolean, nullable=False),
        sa.Column("archived_at", sa.DateTime, nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.add_column(
        "contract_items", sa.Column("service_id", sa.String(36), nullable=True)
    )

    rows = conn.execute(
        sa.text(
            "SELECT i.description, i.amount_cents FROM contract_items i"
            " JOIN contracts c ON c.id = i.contract_id"
            " ORDER BY c.created_at DESC, c.id DESC, i.position"
        )
    ).all()
    newest: dict[str, int] = {}
    for description, amount in rows:
        newest.setdefault(description, amount)

    now = dt.datetime.now(dt.UTC).replace(tzinfo=None)
    for name, price in newest.items():
        service_id = str(uuid4())
        folded = _fold(name)
        conn.execute(
            sa.text(
                "INSERT INTO services (id, name, default_price_cents, is_prewedding,"
                " archived_at, version, created_at, updated_at)"
                " VALUES (:id, :name, :price, :flag, NULL, 1, :now, :now)"
            ),
            {
                "id": service_id,
                "name": name,
                "price": price,
                "flag": "pre-wedding" in folded,
                "now": now,
            },
        )
        conn.execute(
            sa.text(
                "UPDATE contract_items SET service_id = :id WHERE description = :name"
            ),
            {"id": service_id, "name": name},
        )

    with op.batch_alter_table("contract_items", recreate="always") as batch:
        batch.alter_column("service_id", existing_type=sa.String(36), nullable=False)
        batch.create_foreign_key(None, "services", ["service_id"], ["id"])
        batch.create_unique_constraint(
            "uq_contract_items_service", ["contract_id", "service_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("contract_items", recreate="always") as batch:
        batch.drop_constraint("uq_contract_items_service", type_="unique")
        batch.drop_column("service_id")
    op.drop_table("services")
```

If Alembic refuses `create_foreign_key(None, …)` in batch mode, name it `"fk_contract_items_service_id_services"`. Then give the model's `ForeignKey` the same `name=` so that `test_models_match_migrations` stays green.

- [ ] **Step 9: Update the models**

In `backend/src/gerenciador/db/models.py`, change the import line to:

```python
from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
```

Add after `class Client`:

```python
class Service(Base):
    """Something offered in contracts. Items copy its name; renaming never rewrites them."""

    __tablename__ = "services"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    default_price_cents: Mapped[int]
    is_prewedding: Mapped[bool]
    archived_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime)
    version: Mapped[int]
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
```

Replace `class ContractItem` with:

```python
class ContractItem(Base):
    __tablename__ = "contract_items"
    __table_args__ = (
        UniqueConstraint("contract_id", "service_id", name="uq_contract_items_service"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("contracts.id"))
    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"))
    position: Mapped[int]
    description: Mapped[str] = mapped_column(String(200))
    amount_cents: Mapped[int]

    service: Mapped[Service] = relationship(lazy="joined")
```

- [ ] **Step 10: Run the migration and model tests**

Run: `PYTEST tests/db -v`
Expected: `test_migration_0002.py` passes (5 tests). `test_models_match_migrations` passes. `test_foreign_keys_are_enforced` still passes, because the insert fails either way. Update its SQL now, so that it fails on the foreign key rather than on the missing column:

```python
"INSERT INTO contract_items"

" (id, contract_id, service_id, position, description, amount_cents)"
" VALUES ('i1', 'missing', 'missing', 0, 'x', 100)"
```

Add `"services"` to the set in `test_migrations_create_all_tables`.

- [ ] **Step 11: Create `ServiceRepository`**

`backend/src/gerenciador/repositories/service_repository.py`:

```python
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import Service


class ServiceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, service: Service) -> None:
        self._session.add(service)
        self._session.flush()

    def get(self, service_id: str) -> Service | None:
        return self._session.get(Service, service_id)

    def get_many(self, ids: Collection[str]) -> dict[str, Service]:
        if not ids:
            return {}
        rows = self._session.scalars(select(Service).where(Service.id.in_(ids)))
        return {row.id: row for row in rows}

    def all(self, *, include_archived: bool) -> list[Service]:
        stmt = select(Service)
        if not include_archived:
            stmt = stmt.where(Service.archived_at.is_(None))
        return list(self._session.scalars(stmt))
```

- [ ] **Step 12: Seed services in the test fixtures and switch to the new item shape**

In `backend/tests/conftest.py`:

Add imports:

```python
from gerenciador.clock import utcnow
from gerenciador.db.models import Service
```

Add after the `session` fixture:

```python
SERVICE_IDS = {
    "second": "5e7a1c00-0000-4000-8000-000000000001",
    "ceremony": "5e7a1c00-0000-4000-8000-000000000002",
    "dinner": "5e7a1c00-0000-4000-8000-000000000003",
    "prewedding": "5e7a1c00-0000-4000-8000-000000000004",
    "archived": "5e7a1c00-0000-4000-8000-000000000005",
}
_SERVICES = {
    "second": ("Diária segundo fotógrafo", 50000, False),
    "ceremony": ("Cobertura da cerimônia na igreja", 120000, False),
    "dinner": ("Cobertura das fotos protocolares e jantar", 60000, False),
    "prewedding": ("Ensaio de pré-wedding", 80000, True),
    "archived": ("Álbum antigo", 30000, False),
}


@pytest.fixture
def catalog(engine: Engine) -> dict[str, str]:
    """Five services, the last one archived, written straight to the database."""
    now = utcnow()
    with create_session_factory(engine)() as db_session:
        for key, (name, price, prewedding) in _SERVICES.items():
            db_session.add(
                Service(
                    id=SERVICE_IDS[key],
                    name=name,
                    default_price_cents=price,
                    is_prewedding=prewedding,
                    archived_at=now if key == "archived" else None,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
            )
        db_session.commit()
    return SERVICE_IDS
```

Change `make_input` to depend on `catalog` and use ids:

```python
@pytest.fixture
def make_input(catalog: dict[str, str]) -> Callable[..., ContractInput]:
    def _make(**overrides: Any) -> ContractInput:
        base = ContractInput(
            ...  # unchanged fields
            items=[
                ItemInput(catalog["second"], 50000),
                ItemInput(catalog["ceremony"], 120000),
                ItemInput(catalog["dinner"], 60000),
            ],
            ...  # unchanged fields
        )
```

Change `payload` to depend on `catalog` and send ids:

```python
@pytest.fixture
def payload(catalog: dict[str, str]) -> Callable[..., dict[str, Any]]:
    ...
            "payment": {
                "items": [
                    {"service_id": catalog["second"], "amount_cents": 50000},
                    {"service_id": catalog["ceremony"], "amount_cents": 120000},
                    {"service_id": catalog["dinner"], "amount_cents": 60000},
                ],
                "pix_discount_cents": 30000,
            },
```

`catalog` writes through its own session on the same database file that the `api` fixture's app opens, so API tests see the services.

- [ ] **Step 13: Write the failing contract-service tests**

Append to `backend/tests/services/test_contract_service.py`. Add `from sqlalchemy import update` and `from gerenciador.db.models import Service` to the imports. Tests get service ids from the `catalog` fixture.

```python
def _rename(session: Session, service_id: str, name: str) -> None:
    session.execute(update(Service).where(Service.id == service_id).values(name=name))
    session.commit()


def _archive(session: Session, service_id: str) -> None:
    session.execute(
        update(Service).where(Service.id == service_id).values(archived_at=utcnow())
    )
    session.commit()


def _descriptions(view: ContractView) -> list[str]:
    return [item.description for item in view.items]


def test_items_copy_the_service_name(
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    view = contracts.create(ctx, make_input())
    assert [item.service_id for item in view.items] == [
        catalog["second"],
        catalog["ceremony"],
        catalog["dinner"],
    ]
    assert _descriptions(view) == [
        "Diária segundo fotógrafo",
        "Cobertura da cerimônia na igreja",
        "Cobertura das fotos protocolares e jantar",
    ]


def test_a_rename_reaches_only_items_added_after_it(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    created = contracts.create(ctx, make_input())
    _rename(session, catalog["ceremony"], "Cerimônia (novo nome)")
    _rename(session, catalog["prewedding"], "Pré-wedding (novo nome)")

    venue = contracts.update(ctx, created.id, 1, make_input(venue_name="Catedral"))
    assert _descriptions(venue)[1] == "Cobertura da cerimônia na igreja"

    priced = contracts.update(
        ctx,
        created.id,
        2,
        make_input(
            items=[
                ItemInput(catalog["ceremony"], 99000),
                ItemInput(catalog["prewedding"], 80000),
            ]
        ),
    )
    assert _descriptions(priced) == [
        "Cobertura da cerimônia na igreja",
        "Pré-wedding (novo nome)",
    ]
    assert [item.amount_cents for item in priced.items] == [99000, 80000]


def test_reordering_and_swapping_items_reuses_rows(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    a, b, c = catalog["second"], catalog["ceremony"], catalog["dinner"]
    created = contracts.create(
        ctx, make_input(items=[ItemInput(a, 50000), ItemInput(b, 120000)])
    )
    _rename(session, b, "Renomeado")

    swapped = contracts.update(
        ctx,
        created.id,
        1,
        make_input(items=[ItemInput(b, 120000), ItemInput(c, 60000)]),
    )
    assert _descriptions(swapped) == [
        "Cobertura da cerimônia na igreja",
        "Cobertura das fotos protocolares e jantar",
    ]

    reordered = contracts.update(
        ctx,
        created.id,
        2,
        make_input(items=[ItemInput(c, 60000), ItemInput(b, 120000)]),
    )
    assert [item.service_id for item in reordered.items] == [c, b]
    assert _last_event(session).details == {"fields": ["items"], "version": 3}


@pytest.mark.parametrize(
    ("items", "field", "message"),
    [
        (
            lambda ids: [ItemInput("5e7a1c00-0000-4000-8000-0000000000ff", 1000)],
            "payment.items.0.service_id",
            "serviço não encontrado",
        ),
        (
            lambda ids: [
                ItemInput(ids["second"], 1000),
                ItemInput(ids["second"], 2000),
            ],
            "payment.items.1.service_id",
            "serviço repetido no contrato",
        ),
        (
            lambda ids: [ItemInput(ids["archived"], 1000)],
            "payment.items.0.service_id",
            "serviço arquivado",
        ),
    ],
)
def test_invalid_items_are_refused_and_nothing_is_stored(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
    items: Callable[[dict[str, str]], list[ItemInput]],
    field: str,
    message: str,
) -> None:
    with pytest.raises(ContractRuleError) as error:
        contracts.create(ctx, make_input(items=items(catalog), pix_discount_cents=None))
    assert (error.value.field, error.value.message) == (field, message)
    session.rollback()
    assert session.scalars(select(Contract)).all() == []


def test_archived_service_already_on_the_contract_is_kept(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    created = contracts.create(ctx, make_input())
    _archive(session, catalog["ceremony"])
    updated = contracts.update(ctx, created.id, 1, make_input(venue_name="Catedral"))
    assert catalog["ceremony"] in [item.service_id for item in updated.items]

    with pytest.raises(ContractRuleError) as error:
        contracts.create(
            ctx,
            make_input(
                event_date=dt.date(2028, 1, 1),
                items=[ItemInput(catalog["ceremony"], 1000)],
                pix_discount_cents=None,
            ),
        )
    assert error.value.message == "serviço arquivado"


def test_has_prewedding_reads_the_current_flag(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    plain = contracts.create(ctx, make_input())
    assert contracts.has_prewedding(plain.id) is False

    with_pre = contracts.create(
        ctx,
        make_input(
            event_date=dt.date(2028, 1, 1),
            items=[ItemInput(catalog["prewedding"], 80000)],
            pix_discount_cents=None,
        ),
    )
    assert contracts.has_prewedding(with_pre.id) is True

    session.execute(
        update(Service)
        .where(Service.id == catalog["second"])
        .values(is_prewedding=True)
    )
    session.commit()
    assert contracts.has_prewedding(plain.id) is True

    with pytest.raises(NotFoundError):
        contracts.has_prewedding("5e7a1c00-0000-4000-8000-0000000000ff")
```

Add `from gerenciador.clock import utcnow` to the imports, and `Contract` to the existing `gerenciador.db.models` import if it isn't already there.

Fix the existing test at line ~117. Replace `items=[ItemInput("Cobertura completa", 250000)]` with `items=[ItemInput(catalog["ceremony"], 250000)]`, add `catalog: dict[str, str]` to that test's parameters, and change its item assertion to:

```python
    assert [(item.description, item.amount_cents) for item in updated.items] == [
        ("Cobertura da cerimônia na igreja", 250000)
    ]
```

- [ ] **Step 14: Run them to verify they fail**

Run: `PYTEST tests/services/test_contract_service.py -v`
Expected: FAIL, because `ItemInput` still takes `description` and `has_prewedding` does not exist.

- [ ] **Step 15: Implement item resolution in `contract_service.py`**

In `backend/src/gerenciador/services/contract_service.py`:

Change the imports:

```python
from gerenciador.db.models import Client, Contract, ContractItem, Service
from gerenciador.repositories.service_repository import ServiceRepository
```

Replace `ItemInput` and `ItemView`:

```python
@dataclass(frozen=True)
class ItemInput:
    service_id: str
    amount_cents: int


@dataclass(frozen=True)
class ItemView:
    service_id: str
    description: str
    amount_cents: int
```

Delete `_new_items` and add this module-level function after `_check_rules`:

```python
def _item_error(position: int, message: str) -> ContractRuleError:
    return ContractRuleError(f"payment.items.{position}.service_id", message)
```

In `ContractService.__init__`, add `self._services = ServiceRepository(session)`.

Add these methods to `ContractService`:

```python
def has_prewedding(self, contract_id: str) -> bool:
    """True when any item's service is currently marked as a pre-wedding shoot."""
    return any(item.service.is_prewedding for item in self._require(contract_id).items)


def _resolve_services(
    self, data: ContractInput, current: list[ContractItem]
) -> dict[str, Service]:
    """Check every item's service before anything is changed."""
    already_on = {item.service_id for item in current}
    found = self._services.get_many({item.service_id for item in data.items})
    seen: set[str] = set()
    for position, item in enumerate(data.items):
        service = found.get(item.service_id)
        if service is None:
            raise _item_error(position, "serviço não encontrado")
        if item.service_id in seen:
            raise _item_error(position, "serviço repetido no contrato")
        if service.archived_at is not None and item.service_id not in already_on:
            raise _item_error(position, "serviço arquivado")
        seen.add(item.service_id)
    return found


@staticmethod
def _sync_items(
    current: list[ContractItem], data: ContractInput, services: dict[str, Service]
) -> list[ContractItem]:
    """Reuse the row of a service already on the contract, so its wording stays.

    Reusing rows also keeps the (contract, service) unique constraint from firing
    while SQLAlchemy inserts new rows before deleting removed ones.
    """
    existing = {item.service_id: item for item in current}
    result: list[ContractItem] = []
    for position, item in enumerate(data.items):
        row = existing.get(item.service_id)
        if row is None:
            service = services[item.service_id]
            row = ContractItem(
                id=str(uuid4()),
                service_id=service.id,
                service=service,
                description=service.name,
            )
        row.position = position
        row.amount_cents = item.amount_cents
        result.append(row)
    return result
```

In `create`, right after `_check_rules(data)`, add `services = self._resolve_services(data, [])`. In the `Contract(...)` call, replace `items=_new_items(data),` with `items=self._sync_items([], data, services),`.

In `_apply_update`, right after `_check_rules(data)`, add `services = self._resolve_services(data, contract.items)`. Replace the items block with:

```python
        current_items = [(item.service_id, item.amount_cents) for item in contract.items]
        if current_items != [(item.service_id, item.amount_cents) for item in data.items]:
            contract.items = self._sync_items(contract.items, data, services)
            changed.append("items")
```

In `_to_view`, build items as:

```python
        items = [
            ItemView(item.service_id, item.description, item.amount_cents)
            for item in contract.items
        ]
```

- [ ] **Step 16: Switch the API schemas to the new item shape**

In `backend/src/gerenciador/api/v1/schemas.py`:

Add `from uuid import UUID` to the imports.

```python
class ItemIn(StrictModel):
    service_id: UUID
    amount_cents: Cents
```

In `ContractCreate.to_input`:

```python
items = (
    [ItemInput(str(item.service_id), item.amount_cents) for item in self.payment.items],
)
```

In `_as_request`:

```python
            "items": [
                {"service_id": item.service_id, "amount_cents": item.amount_cents}
                for item in view.items
            ],
```

```python
class ItemOut(BaseModel):
    service_id: str
    description: str
    amount_cents: int
```

In `ContractOut.from_view`:

```python
items = (
    [
        ItemOut(
            service_id=item.service_id,
            description=item.description,
            amount_cents=item.amount_cents,
        )
        for item in view.items
    ],
)
```

- [ ] **Step 17: Update the remaining tests to the new item shape**

`backend/tests/services/test_contract_renderer.py`, the injection test (line ~169). The hostile text now comes from a service name. Add `session: Session` to its parameters, and before building `injected`:

```python
    session.add(
        Service(
            id="5e7a1c00-0000-4000-8000-0000000000aa",
            name="Cobertura\n\n# Outro",
            default_price_cents=230000,
            is_prewedding=False,
            archived_at=None,
            version=1,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )
    session.commit()
```

Replace `items=[ItemInput("Cobertura\n\n# Outro", 230000)]` with `items=[ItemInput("5e7a1c00-0000-4000-8000-0000000000aa", 230000)]`. Add imports for `Service`, `utcnow` and `Session`.

`backend/tests/api/test_contracts_api.py`:

- In the `test_create_validation` cases, replace `{"description": "x", …}` with `{"service_id": "5e7a1c00-0000-4000-8000-000000000001", …}` (keep the `amount_cents` values).
- Replace the control-character case with these two:

```python
(
    (
        "payment.items",
        [{"service_id": "not-a-uuid", "amount_cents": 100000}],
        "payment.items.0.service_id",
    ),
)
(
    (
        "payment.items",
        [
            {
                "service_id": "5e7a1c00-0000-4000-8000-0000000000ff",
                "amount_cents": 100000,
            }
        ],
        "payment.items.0.service_id",
    ),
)
```

- In the patch test (line ~263), send `{"service_id": SERVICE_ID_CEREMONY, "amount_cents": 100000}`, where `SERVICE_ID_CEREMONY = "5e7a1c00-0000-4000-8000-000000000002"` is a module constant. Assert:

```python
    assert replaced["payment"]["items"] == [
        {
            "service_id": SERVICE_ID_CEREMONY,
            "description": "Cobertura da cerimônia na igreja",
            "amount_cents": 100000,
        }
    ]
```

- In `test_create_returns_the_contract`, add:

```python
    assert body["payment"]["items"][0] == {
        "service_id": "5e7a1c00-0000-4000-8000-000000000001",
        "description": "Diária segundo fotógrafo",
        "amount_cents": 50000,
    }
```

- [ ] **Step 18: Run the whole backend suite**

Run: `PYTEST -q`
Expected: every test passes. If another test builds items with `description`, convert it the same way. To find them, run `grep -rn '"description"' backend/tests` and `grep -rn 'ItemInput("' backend/tests`.

- [ ] **Step 19: Regenerate `openapi.json` and run the backend checks**

Run: `make openapi && make check-backend`
Expected: format, lint, mypy and pytest pass, with coverage ≥ 90% and domain at 100%.

- [ ] **Step 20: Commit**

```bash
git add backend openapi.json
git commit -m "feat: link contract items to catalog services and keep their wording"
```

---

### Task 2: Catalog service (create, edit, archive, restore)

**Files:**
- Create: `backend/src/gerenciador/services/catalog_service.py`, `backend/tests/services/test_catalog_service.py`
- Modify: `backend/src/gerenciador/services/exceptions.py`, `backend/src/gerenciador/api/errors.py`, `backend/tests/conftest.py`

**Interfaces:**
- Consumes:
  - `ServiceRepository` (Task 1).
  - `fold` (Task 1).
  - `AuditService.record`.
- Produces:
  - `ServiceInput(name: str, default_price_cents: int, is_prewedding: bool)`.
  - `ServiceChanges(name: str | None = None, default_price_cents: int | None = None, is_prewedding: bool | None = None)`.
  - `ServiceView(id, name, default_price_cents, is_prewedding, archived_at, version, created_at, updated_at)`.
  - `CatalogService(session, audit)`, with methods `list(*, include_archived: bool) -> list[ServiceView]`, `get(service_id) -> ServiceView`, `create(ctx, data: ServiceInput) -> ServiceView`, `update(ctx, service_id, expected_version: int, changes: ServiceChanges) -> ServiceView`, `archive(ctx, service_id) -> ServiceView` and `restore(ctx, service_id) -> ServiceView`.
  - `StaleVersionError(entity: str = "contract")` with an `.entity` attribute.
  - Test fixture `catalog_service`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/conftest.py`:

```python
from gerenciador.services.catalog_service import CatalogService


@pytest.fixture
def catalog_service(session: Session, audit: AuditService) -> CatalogService:
    return CatalogService(session, audit)
```

`backend/tests/services/test_catalog_service.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent
from gerenciador.services.catalog_service import (
    CatalogService,
    ServiceChanges,
    ServiceInput,
)
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    StaleVersionError,
)

MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"


def _events(session: Session) -> list[tuple[str, dict[str, object]]]:
    rows = session.scalars(select(AuditEvent).order_by(AuditEvent.id))
    return [(row.action, row.details) for row in rows]


def _album(
    catalog_service: CatalogService, ctx: RequestContext, name: str = "Álbum"
) -> str:
    return catalog_service.create(ctx, ServiceInput(name, 150000, False)).id


def test_create_stores_and_audits_without_values(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    view = catalog_service.create(
        ctx, ServiceInput("Ensaio de pré-wedding", 80000, True)
    )
    assert (view.name, view.default_price_cents, view.is_prewedding) == (
        "Ensaio de pré-wedding",
        80000,
        True,
    )
    assert (view.version, view.archived_at) == (1, None)
    assert catalog_service.get(view.id) == view
    assert _events(session) == [("service.created", {"version": 1})]


def test_list_sorts_ignoring_case_and_accents_and_hides_archived(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    for name in ("diária", "Álbum", "Cerimônia", "bolo"):
        catalog_service.create(ctx, ServiceInput(name, 1000, False))
    archived = catalog_service.create(ctx, ServiceInput("Antigo", 1000, False))
    catalog_service.archive(ctx, archived.id)

    assert [s.name for s in catalog_service.list(include_archived=False)] == [
        "Álbum",
        "bolo",
        "Cerimônia",
        "diária",
    ]
    assert [s.name for s in catalog_service.list(include_archived=True)] == [
        "Álbum",
        "Antigo",
        "bolo",
        "Cerimônia",
        "diária",
    ]


def test_names_collide_ignoring_case(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    _album(catalog_service, ctx)
    with pytest.raises(ConflictError):
        catalog_service.create(ctx, ServiceInput("ÁLBUM", 1000, False))
    other = catalog_service.create(ctx, ServiceInput("Moldura", 1000, False))
    with pytest.raises(ConflictError):
        catalog_service.update(ctx, other.id, 1, ServiceChanges(name="álbum"))


def test_update_changes_only_sent_fields_and_audits_their_names(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    view = catalog_service.update(
        ctx,
        service_id,
        1,
        ServiceChanges(default_price_cents=175000, is_prewedding=False),
    )
    assert (view.name, view.default_price_cents, view.version) == ("Álbum", 175000, 2)
    assert _events(session)[-1] == (
        "service.updated",
        {"fields": ["default_price_cents"], "version": 2},
    )


def test_update_keeping_its_own_name_is_not_a_conflict(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    view = catalog_service.update(ctx, service_id, 1, ServiceChanges(name="ÁLBUM"))
    assert view.name == "ÁLBUM"


def test_update_with_nothing_new_keeps_the_version(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    view = catalog_service.update(ctx, service_id, 1, ServiceChanges(name="Álbum"))
    assert view.version == 1
    assert [action for action, _ in _events(session)] == ["service.created"]


def test_update_checks_the_version(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    with pytest.raises(StaleVersionError) as error:
        catalog_service.update(ctx, service_id, 7, ServiceChanges(name="Outro"))
    assert error.value.entity == "service"


def test_archive_and_restore_bump_the_version_and_audit(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    archived = catalog_service.archive(ctx, service_id)
    assert archived.archived_at is not None and archived.version == 2
    with pytest.raises(ConflictError):
        catalog_service.archive(ctx, service_id)

    restored = catalog_service.restore(ctx, service_id)
    assert restored.archived_at is None and restored.version == 3
    with pytest.raises(ConflictError):
        catalog_service.restore(ctx, service_id)
    assert [e for e in _events(session) if e[0] != "service.created"] == [
        ("service.archived", {"version": 2}),
        ("service.restored", {"version": 3}),
    ]


def test_restore_refuses_a_name_taken_meanwhile(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    old = _album(catalog_service, ctx)
    catalog_service.archive(ctx, old)
    _album(catalog_service, ctx, "álbum")
    with pytest.raises(ConflictError):
        catalog_service.restore(ctx, old)


def test_an_archived_service_can_be_renamed_to_a_taken_name(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    _album(catalog_service, ctx)
    other = catalog_service.create(ctx, ServiceInput("Moldura", 1000, False))
    catalog_service.archive(ctx, other.id)
    view = catalog_service.update(ctx, other.id, 2, ServiceChanges(name="Álbum"))
    assert view.name == "Álbum"


@pytest.mark.parametrize("action", ["get", "archive", "restore", "update"])
def test_unknown_id_is_not_found(
    catalog_service: CatalogService, ctx: RequestContext, action: str
) -> None:
    with pytest.raises(NotFoundError):
        if action == "get":
            catalog_service.get(MISSING)
        elif action == "update":
            catalog_service.update(ctx, MISSING, 1, ServiceChanges(name="x"))
        else:
            getattr(catalog_service, action)(ctx, MISSING)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PYTEST tests/services/test_catalog_service.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'gerenciador.services.catalog_service'`.

- [ ] **Step 3: Give `StaleVersionError` an entity**

In `backend/src/gerenciador/services/exceptions.py`:

```python
class StaleVersionError(Exception):
    """The caller's version of a contract or service is not the current one."""

    def __init__(self, entity: str = "contract") -> None:
        super().__init__(f"{entity} changed")
        self.entity = entity
```

In `backend/src/gerenciador/api/errors.py`:

```python
def _stale(request: Request, exc: Exception) -> Response:
    entity = cast(StaleVersionError, exc).entity
    return problem_response(
        412, f"The {entity} changed since it was loaded", _request_id(request)
    )
```

- [ ] **Step 4: Implement `CatalogService`**

`backend/src/gerenciador/services/catalog_service.py`:

```python
"""Services offered in contracts: list, create, edit, archive and restore."""

import datetime as dt
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import Service
from gerenciador.domain.text import fold
from gerenciador.repositories.service_repository import ServiceRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    StaleVersionError,
)

_ENTITY = "service"
_FIELDS = ("name", "default_price_cents", "is_prewedding")


@dataclass(frozen=True)
class ServiceInput:
    name: str
    default_price_cents: int
    is_prewedding: bool


@dataclass(frozen=True)
class ServiceChanges:
    """Fields left as None are not changed."""

    name: str | None = None
    default_price_cents: int | None = None
    is_prewedding: bool | None = None


@dataclass(frozen=True)
class ServiceView:
    id: str
    name: str
    default_price_cents: int
    is_prewedding: bool
    archived_at: dt.datetime | None
    version: int
    created_at: dt.datetime
    updated_at: dt.datetime


def _view(service: Service) -> ServiceView:
    return ServiceView(
        id=service.id,
        name=service.name,
        default_price_cents=service.default_price_cents,
        is_prewedding=service.is_prewedding,
        archived_at=service.archived_at,
        version=service.version,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


class CatalogService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._repo = ServiceRepository(session)
        self._audit = audit

    def list(self, *, include_archived: bool) -> list[ServiceView]:
        rows = self._repo.all(include_archived=include_archived)
        return [
            _view(row) for row in sorted(rows, key=lambda row: (fold(row.name), row.id))
        ]

    def get(self, service_id: str) -> ServiceView:
        return _view(self._require(service_id))

    def create(self, ctx: RequestContext, data: ServiceInput) -> ServiceView:
        self._check_name_free(data.name, except_id=None)
        now = utcnow()
        service = Service(
            id=str(uuid4()),
            name=data.name,
            default_price_cents=data.default_price_cents,
            is_prewedding=data.is_prewedding,
            archived_at=None,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self._repo.add(service)
        self._audit.record(
            ctx,
            "service.created",
            entity_type=_ENTITY,
            entity_id=service.id,
            details={"version": 1},
        )
        self._session.commit()
        return _view(service)

    def update(
        self,
        ctx: RequestContext,
        service_id: str,
        expected_version: int,
        changes: ServiceChanges,
    ) -> ServiceView:
        service = self._require(service_id)
        if service.version != expected_version:
            raise StaleVersionError(_ENTITY)
        changed = [
            field
            for field in _FIELDS
            if getattr(changes, field) is not None
            and getattr(changes, field) != getattr(service, field)
        ]
        if (
            changes.name is not None
            and "name" in changed
            and service.archived_at is None
        ):
            self._check_name_free(changes.name, except_id=service.id)
        if changed:
            for field in changed:
                setattr(service, field, getattr(changes, field))
            self._bump(service)
            self._audit.record(
                ctx,
                "service.updated",
                entity_type=_ENTITY,
                entity_id=service.id,
                details={"fields": changed, "version": service.version},
            )
        self._session.commit()
        return _view(service)

    def archive(self, ctx: RequestContext, service_id: str) -> ServiceView:
        service = self._require(service_id)
        if service.archived_at is not None:
            raise ConflictError("service is already archived")
        service.archived_at = utcnow()
        return self._record_state(ctx, service, "service.archived")

    def restore(self, ctx: RequestContext, service_id: str) -> ServiceView:
        service = self._require(service_id)
        if service.archived_at is None:
            raise ConflictError("service is not archived")
        self._check_name_free(service.name, except_id=service.id)
        service.archived_at = None
        return self._record_state(ctx, service, "service.restored")

    def _record_state(
        self, ctx: RequestContext, service: Service, action: str
    ) -> ServiceView:
        self._bump(service)
        self._audit.record(
            ctx,
            action,
            entity_type=_ENTITY,
            entity_id=service.id,
            details={"version": service.version},
        )
        self._session.commit()
        return _view(service)

    @staticmethod
    def _bump(service: Service) -> None:
        service.version += 1
        service.updated_at = utcnow()

    def _check_name_free(self, name: str, *, except_id: str | None) -> None:
        key = name.casefold()
        for other in self._repo.all(include_archived=False):
            if other.id != except_id and other.name.casefold() == key:
                raise ConflictError("an active service already has this name")

    def _require(self, service_id: str) -> Service:
        service = self._repo.get(service_id)
        if service is None:
            raise NotFoundError(_ENTITY, service_id)
        return service
```

- [ ] **Step 5: Run the tests**

Run: `PYTEST tests/services/test_catalog_service.py tests/api -q`
Expected: PASS. The API suite confirms that the existing 412 message is still "The contract changed since it was loaded".

- [ ] **Step 6: Run the backend checks and commit**

Run: `make check-backend`
Expected: PASS.

```bash
git add backend
git commit -m "feat: add the catalog service to create, edit, archive and restore services"
```

---

### Task 3: Services API

**Files:**
- Create: `backend/src/gerenciador/api/v1/versioning.py`, `backend/src/gerenciador/api/v1/services.py`, `backend/tests/api/test_services_api.py`
- Modify:
  - `backend/src/gerenciador/api/v1/contracts.py`
  - `backend/src/gerenciador/api/v1/schemas.py`
  - `backend/src/gerenciador/api/v1/__init__.py`
  - `backend/src/gerenciador/api/deps.py`
  - `backend/tests/api/test_contracts_api.py`
  - `backend/tests/test_privacy.py`
  - `openapi.json`

**Interfaces:**
- Consumes: `CatalogService`, `ServiceInput`, `ServiceChanges`, `ServiceView` and `StaleVersionError(entity)` (Task 2).
- Produces:
  - `expected_version(if_match: str | None, entity: str) -> int`.
  - Schemas `ServiceIn`, `ServicePatch` and `ServiceOut`.
  - The HTTP endpoints listed in spec section 3.1.

- [ ] **Step 1: Write the failing API tests**

`backend/tests/api/test_services_api.py`:

```python
from typing import Any

import pytest
from fastapi.testclient import TestClient

URL = "/api/v1/services"
PROBLEM = "application/problem+json"
MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"


def _create(api: TestClient, **overrides: Any) -> dict[str, Any]:
    body = {
        "name": "Álbum",
        "default_price_cents": 150000,
        "is_prewedding": False,
        **overrides,
    }
    response = api.post(URL, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def test_create_returns_the_service(api: TestClient) -> None:
    response = api.post(
        URL,
        json={
            "name": "  Ensaio de pré-wedding ",
            "default_price_cents": 80000,
            "is_prewedding": True,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    assert response.headers["ETag"] == '"1"'
    assert body == {
        "id": body["id"],
        "name": "Ensaio de pré-wedding",
        "default_price_cents": 80000,
        "is_prewedding": True,
        "archived_at": None,
        "version": 1,
    }


def test_is_prewedding_defaults_to_false(api: TestClient) -> None:
    response = api.post(URL, json={"name": "Moldura", "default_price_cents": 1000})
    assert response.json()["is_prewedding"] is False


def test_list_is_a_sorted_array_and_hides_archived(api: TestClient) -> None:
    _create(api, name="diária")
    _create(api, name="Álbum")
    archived = _create(api, name="Antigo")
    assert api.post(f"{URL}/{archived['id']}/archive").status_code == 200

    assert [s["name"] for s in api.get(URL).json()] == ["Álbum", "diária"]
    assert [
        s["name"] for s in api.get(URL, params={"include_archived": True}).json()
    ] == [
        "Álbum",
        "Antigo",
        "diária",
    ]


def test_get_one_with_etag(api: TestClient) -> None:
    created = _create(api)
    response = api.get(f"{URL}/{created['id']}")
    assert response.status_code == 200
    assert response.headers["ETag"] == '"1"'
    assert response.json() == created


def test_patch_needs_if_match_and_checks_it(api: TestClient) -> None:
    created = _create(api)
    url = f"{URL}/{created['id']}"
    assert api.patch(url, json={"name": "Outro"}).status_code == 428
    stale = api.patch(url, json={"name": "Outro"}, headers={"If-Match": '"9"'})
    assert stale.status_code == 412
    assert stale.json()["detail"] == "The service changed since it was loaded"

    response = api.patch(
        url, json={"default_price_cents": 175000}, headers={"If-Match": '"1"'}
    )
    assert response.status_code == 200
    assert response.headers["ETag"] == '"2"'
    assert response.json()["default_price_cents"] == 175000
    assert response.json()["name"] == "Álbum"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({}, ""),
        ({"name": ""}, "name"),
        ({"name": "x" * 201}, "name"),
        ({"name": "Á\x00lbum"}, "name"),
        ({"default_price_cents": 0}, "default_price_cents"),
        ({"default_price_cents": 100_000_001}, "default_price_cents"),
        ({"is_prewedding": "sim"}, "is_prewedding"),
        ({"color": "azul"}, "*"),
    ],
)
def test_patch_validation(api: TestClient, body: dict[str, Any], field: str) -> None:
    created = _create(api)
    response = api.patch(
        f"{URL}/{created['id']}", json=body, headers={"If-Match": '"1"'}
    )
    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM
    assert field in [error["field"] for error in response.json()["errors"]]


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"default_price_cents": 1000}, "name"),
        ({"name": "Álbum"}, "default_price_cents"),
        ({"name": "Álbum", "default_price_cents": 10.5}, "default_price_cents"),
        (
            {"name": "Álbum", "default_price_cents": 1000, "is_prewedding": 1},
            "is_prewedding",
        ),
    ],
)
def test_create_validation(api: TestClient, body: dict[str, Any], field: str) -> None:
    response = api.post(URL, json=body)
    assert response.status_code == 422
    assert field in [error["field"] for error in response.json()["errors"]]


def test_name_conflicts_are_409(api: TestClient) -> None:
    first = _create(api)
    assert (
        api.post(URL, json={"name": "ÁLBUM", "default_price_cents": 1}).status_code
        == 409
    )
    api.post(f"{URL}/{first['id']}/archive")
    _create(api, name="álbum")
    restore = api.post(f"{URL}/{first['id']}/restore")
    assert restore.status_code == 409
    assert restore.headers["content-type"] == PROBLEM


def test_archive_and_restore(api: TestClient) -> None:
    created = _create(api)
    archived = api.post(f"{URL}/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.headers["ETag"] == '"2"'
    assert archived.json()["archived_at"] is not None
    assert api.post(f"{URL}/{created['id']}/archive").status_code == 409
    restored = api.post(f"{URL}/{created['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None
    assert api.post(f"{URL}/{created['id']}/restore").status_code == 409


@pytest.mark.parametrize(
    ("method", "suffix"),
    [("get", ""), ("post", "/archive"), ("post", "/restore")],
)
def test_unknown_service_is_404(api: TestClient, method: str, suffix: str) -> None:
    response = getattr(api, method)(f"{URL}/{MISSING}{suffix}")
    assert response.status_code == 404
    assert response.headers["content-type"] == PROBLEM


def test_a_service_made_through_the_api_can_be_used_in_a_contract(
    api: TestClient, payload: Any
) -> None:
    service = _create(api, name="Drone", default_price_cents=40000)
    body = payload()
    body["payment"]["items"].append(
        {"service_id": service["id"], "amount_cents": 45000}
    )
    response = api.post("/api/v1/contracts", json=body)
    assert response.status_code == 201
    assert response.json()["payment"]["items"][-1] == {
        "service_id": service["id"],
        "description": "Drone",
        "amount_cents": 45000,
    }
```

In `backend/tests/api/test_contracts_api.py`, change the import to `from gerenciador.api.v1.versioning import expected_version`. At line ~369, change the call to `expected_version(value, "contract")`.

Append to `backend/tests/test_privacy.py`:

```python
def test_service_audit_details_hold_no_names_or_prices(api: TestClient) -> None:
    created = api.post(
        "/api/v1/services",
        json={"name": "Álbum Exclusivo", "default_price_cents": 123456},
    ).json()
    url = f"/api/v1/services/{created['id']}"
    api.patch(url, json={"name": "Álbum Raro"}, headers={"If-Match": '"1"'})
    api.post(f"{url}/archive")
    api.post(f"{url}/restore")

    events = api.get(
        "/api/v1/audit-events", params={"entity_id": created["id"]}
    ).json()["items"]
    assert {event["action"] for event in events} == {
        "service.created",
        "service.updated",
        "service.archived",
        "service.restored",
    }
    text = str([event["details"] for event in events])
    for value in ("Álbum", "Exclusivo", "Raro", "123456"):
        assert value not in text
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PYTEST tests/api/test_services_api.py tests/test_privacy.py -v`
Expected: FAIL, because `/api/v1/services` returns 404 for every route and `gerenciador.api.v1.versioning` does not exist.

- [ ] **Step 3: Move `If-Match` parsing to `versioning.py`**

`backend/src/gerenciador/api/v1/versioning.py`:

```python
"""Reading the If-Match header that guards edits."""

import re

from fastapi import HTTPException

from gerenciador.services.exceptions import StaleVersionError

_STRONG_VERSION = re.compile(r'"([0-9]{1,18})"')


def expected_version(if_match: str | None, entity: str) -> int:
    """Read a strong `"<n>"` validator. Anything else cannot match any version."""
    if if_match is None:
        raise HTTPException(status_code=428, detail="If-Match header is required")
    match = _STRONG_VERSION.fullmatch(if_match.strip())
    if match is None:
        raise StaleVersionError(entity)
    return int(match.group(1))
```

In `backend/src/gerenciador/api/v1/contracts.py`:
- Delete `_STRONG_VERSION` and `_expected_version`, and the now-unused `re` and `StaleVersionError` imports.
- Import `expected_version` from `gerenciador.api.v1.versioning`.
- In `update_contract`, use `expected_version(if_match, "contract")`.
- Keep the `HTTPException` import only if something else uses it.

- [ ] **Step 4: Add the schemas**

In `backend/src/gerenciador/api/v1/schemas.py`, import `ServiceChanges, ServiceInput, ServiceView` from `gerenciador.services.catalog_service`. Add `Flag = Annotated[bool, Field(strict=True)]` next to the other annotated types.

In the requests section:

```python
class ServiceIn(StrictModel):
    name: Name
    default_price_cents: Cents
    is_prewedding: Flag = False

    def to_input(self) -> ServiceInput:
        return ServiceInput(self.name, self.default_price_cents, self.is_prewedding)


class ServicePatch(StrictModel):
    """Every field optional. Only the fields sent are changed."""

    name: Name | None = None
    default_price_cents: Cents | None = None
    is_prewedding: Flag | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> Self:
        if (
            self.name is None
            and self.default_price_cents is None
            and self.is_prewedding is None
        ):
            raise ValueError("informe ao menos um campo")
        return self

    def to_changes(self) -> ServiceChanges:
        return ServiceChanges(self.name, self.default_price_cents, self.is_prewedding)
```

In the responses section:

```python
class ServiceOut(BaseModel):
    id: str
    name: str
    default_price_cents: int
    is_prewedding: bool
    archived_at: dt.datetime | None
    version: int

    @classmethod
    def from_view(cls, view: ServiceView) -> Self:
        return cls(
            id=view.id,
            name=view.name,
            default_price_cents=view.default_price_cents,
            is_prewedding=view.is_prewedding,
            archived_at=view.archived_at,
            version=view.version,
        )
```

- [ ] **Step 5: Add the dependency and the router**

In `backend/src/gerenciador/api/deps.py`, import `CatalogService` and add:

```python
def get_catalog_service(session: DbSession) -> CatalogService:
    return CatalogService(session, AuditService(session))
```

```python
Catalog = Annotated[CatalogService, Depends(get_catalog_service)]
```

`backend/src/gerenciador/api/v1/services.py`:

```python
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response

from gerenciador.api.deps import Catalog, Ctx
from gerenciador.api.v1.schemas import ServiceIn, ServiceOut, ServicePatch
from gerenciador.api.v1.versioning import expected_version
from gerenciador.services.catalog_service import ServiceView

router = APIRouter(prefix="/services", tags=["services"])


def _respond(view: ServiceView, response: Response) -> ServiceOut:
    response.headers["ETag"] = f'"{view.version}"'
    return ServiceOut.from_view(view)


@router.get("")
def list_services(service: Catalog, include_archived: bool = False) -> list[ServiceOut]:
    return [
        ServiceOut.from_view(view)
        for view in service.list(include_archived=include_archived)
    ]


@router.post("", status_code=201)
def create_service(
    body: ServiceIn, response: Response, ctx: Ctx, service: Catalog
) -> ServiceOut:
    view = service.create(ctx, body.to_input())
    response.headers["Location"] = f"/api/v1/services/{view.id}"
    return _respond(view, response)


@router.get("/{service_id}")
def get_service(service_id: UUID, response: Response, service: Catalog) -> ServiceOut:
    return _respond(service.get(str(service_id)), response)


@router.patch("/{service_id}")
def update_service(
    service_id: UUID,
    body: ServicePatch,
    response: Response,
    ctx: Ctx,
    service: Catalog,
    if_match: Annotated[str | None, Header()] = None,
) -> ServiceOut:
    version = expected_version(if_match, "service")
    return _respond(
        service.update(ctx, str(service_id), version, body.to_changes()), response
    )


@router.post("/{service_id}/archive")
def archive_service(
    service_id: UUID, response: Response, ctx: Ctx, service: Catalog
) -> ServiceOut:
    return _respond(service.archive(ctx, str(service_id)), response)


@router.post("/{service_id}/restore")
def restore_service(
    service_id: UUID, response: Response, ctx: Ctx, service: Catalog
) -> ServiceOut:
    return _respond(service.restore(ctx, str(service_id)), response)
```

In `backend/src/gerenciador/api/v1/__init__.py`, import `services` and add `api_router.include_router(services.router)` after the clients router.

- [ ] **Step 6: Run the tests**

Run: `PYTEST -q`
Expected: PASS. `tests/test_export_openapi.py` fails until `openapi.json` is regenerated in the next step.

- [ ] **Step 7: Regenerate the schema, run the checks and commit**

Run: `make openapi && make check-backend`
Expected: PASS.

```bash
git add backend openapi.json
git commit -m "feat: add the services API with versioned edits, archive and restore"
```

---

### Task 4: Contract form picks items from the catalog

**Files:**
- Create:
  - `frontend/src/api/services.ts`
  - `frontend/src/domain/fieldRules.ts`
  - `frontend/src/ui/Select.tsx`
  - `frontend/src/ui/Select.module.css`
  - `frontend/src/features/contracts/serviceOptions.ts`
  - `frontend/src/features/contracts/serviceOptions.test.ts`
  - `frontend/src/features/contracts/sections/ServiceField.tsx`
- Modify:
  - `frontend/src/api/schema.d.ts` (generated)
  - `frontend/src/api/client.ts`
  - `frontend/src/api/keys.ts`
  - `frontend/src/ui/index.ts`
  - `frontend/src/features/contracts/formModel.ts`
  - `frontend/src/features/contracts/formModel.test.ts`
  - `frontend/src/features/contracts/sections/PaymentSection.tsx`
  - `frontend/src/features/contracts/ContractForm.tsx`
  - `frontend/src/features/contracts/EditContract.tsx`
  - `frontend/src/features/contracts/ContractFormPage.create.test.tsx`
  - `frontend/src/features/contracts/ContractFormPage.edit.test.tsx`
  - `frontend/src/test/fixtures.ts`
  - `frontend/src/test/server.ts`
  - `frontend/e2e/helpers.ts`

**Interfaces:**
- Consumes: the `/api/v1/services` endpoints (Task 3), and the `ItemIn`/`ItemOut` shapes (Task 1).
- Produces:
  - Types `ServiceOut`, `ServiceIn`, `ServicePatch` and `ItemOut` from `api/client.ts`.
  - `serviceKeys.all` and `serviceKeys.list(includeArchived)`.
  - Hooks `useServices(includeArchived: boolean)`, `useCreateService()`, `useUpdateService()` (variables `{ id, version, body }`), `useArchiveService()` and `useRestoreService()`, each taking an id.
  - `REQUIRED`, `textError(value, max, required)` and `amountError(text, required)` from `domain/fieldRules.ts`.
  - The `Select` UI component.
  - Fixtures `IDS.serviceCeremony`, `IDS.serviceSecond`, `IDS.servicePrewedding`, `IDS.serviceArchived`, plus `makeService()`, `SERVICES` and `servicesHandler`.

- [ ] **Step 1: Regenerate API types and add type aliases and keys**

Run: `make api-types`

In `frontend/src/api/client.ts`, add:

```ts
export type ItemOut = Schemas["ItemOut"];
export type ServiceOut = Schemas["ServiceOut"];
export type ServiceIn = Schemas["ServiceIn"];
export type ServicePatch = Schemas["ServicePatch"];
```

In `frontend/src/api/keys.ts`, add:

```ts
export const serviceKeys = {
  all: ["services"] as const,
  list: (includeArchived: boolean) => ["services", { includeArchived }] as const,
};
```

`frontend/src/api/services.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ServiceIn, type ServicePatch, api, unwrap } from "./client";
import { serviceKeys } from "./keys";

const path = (id: string) => ({ path: { service_id: id } });

export function useServices(includeArchived: boolean) {
  return useQuery({
    queryKey: serviceKeys.list(includeArchived),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/services", { params: { query: { include_archived: includeArchived } } }),
      ),
  });
}

// Contracts keep their own copy of each item, so a catalog change touches no contract cache.
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: serviceKeys.all });
}

export function useCreateService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: ServiceIn) => unwrap(api.POST("/api/v1/services", { body })),
    onSuccess: refresh,
  });
}

export function useUpdateService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version, body }: { id: string; version: number; body: ServicePatch }) =>
      unwrap(
        api.PATCH("/api/v1/services/{service_id}", {
          params: { ...path(id), header: { "if-match": `"${version}"` } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useArchiveService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/services/{service_id}/archive", { params: path(id) })),
    onSuccess: refresh,
  });
}

export function useRestoreService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/services/{service_id}/restore", { params: path(id) })),
    onSuccess: refresh,
  });
}
```

Run: `cd frontend && npm run typecheck`
Expected: errors only in `features/contracts/formModel.ts` and the test fixtures, about `description` and `service_id` on items. The next steps fix them.

- [ ] **Step 2: Add the service fixtures and a default MSW handler**

In `frontend/src/test/fixtures.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { ClientOut, ContractOut, ServiceOut } from "../api/client";

export const IDS = {
  contract: "6f1c0a52-1111-4000-8000-000000000001",
  groom: "6f1c0a52-2222-4000-8000-000000000002",
  bride: "6f1c0a52-3333-4000-8000-000000000003",
  serviceCeremony: "6f1c0a52-4444-4000-8000-000000000004",
  serviceSecond: "6f1c0a52-5555-4000-8000-000000000005",
  servicePrewedding: "6f1c0a52-6666-4000-8000-000000000006",
  serviceArchived: "6f1c0a52-7777-4000-8000-000000000007",
};
```

Add after `makeClient`:

```ts
export function makeService(overrides: Partial<ServiceOut> = {}): ServiceOut {
  return {
    id: IDS.serviceCeremony,
    name: "Cobertura da cerimônia na igreja",
    default_price_cents: 120000,
    is_prewedding: false,
    archived_at: null,
    version: 1,
    ...overrides,
  };
}

/** Sorted as the server sorts: by name, ignoring case and accents. */
export const SERVICES: ServiceOut[] = [
  makeService({
    id: IDS.serviceArchived,
    name: "Álbum antigo",
    default_price_cents: 30000,
    archived_at: STAMP,
    version: 2,
  }),
  makeService(),
  makeService({ id: IDS.serviceSecond, name: "Diária segundo fotógrafo", default_price_cents: 50000 }),
  makeService({
    id: IDS.servicePrewedding,
    name: "Ensaio de pré-wedding",
    default_price_cents: 80000,
    is_prewedding: true,
  }),
];

export function servicesHandler(services: ServiceOut[] = SERVICES) {
  return http.get("/api/v1/services", ({ request }) => {
    const all = new URL(request.url).searchParams.get("include_archived") === "true";
    return HttpResponse.json(all ? services : services.filter((s) => s.archived_at === null));
  });
}
```

In `makeContract`, change the items to:

```ts
      items: [
        {
          service_id: IDS.serviceCeremony,
          description: "Cobertura da cerimônia na igreja",
          amount_cents: 120000,
        },
        { service_id: IDS.serviceSecond, description: "Diária segundo fotógrafo", amount_cents: 50000 },
      ],
```

`frontend/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";
import { servicesHandler } from "./fixtures";

// The catalog is read by every contract form; tests override it with server.use().
export const server = setupServer(servicesHandler());
```

- [ ] **Step 3: Move the shared field rules out of `formModel.ts`**

`frontend/src/domain/fieldRules.ts`, holding the functions moved verbatim from `formModel.ts`:

```ts
import { MAX_CENTS, parseBrl } from "./money";

export const REQUIRED = "campo obrigatório";
// Unicode category Cc, as the backend refuses it.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export function textError(value: string, max: number, required: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return required ? REQUIRED : null;
  // The API strips whitespace before refusing control characters, so check the trimmed text.
  if (CONTROL.test(trimmed)) return "não pode conter caracteres de controle";
  // Python counts code points, so an astral character is one character here too.
  if ([...trimmed].length > max) return `máximo de ${max} caracteres`;
  return null;
}

export function amountError(text: string, required: boolean): string | null {
  const cents = parseBrl(text);
  if (cents === null) return required ? REQUIRED : null;
  if (Number.isNaN(cents)) return "valor inválido";
  if (cents <= 0) return "o valor deve ser maior que zero";
  if (cents > MAX_CENTS) return "valor máximo R$ 1.000.000,00";
  return null;
}
```

In `formModel.ts`:
- Delete `REQUIRED`, `CONTROL`, `textError` and `amountError`.
- Import them with `import { REQUIRED, amountError, textError } from "../../domain/fieldRules";`.
- Drop `MAX_CENTS` from the money import if it is now unused.

- [ ] **Step 4: Write the failing form-model tests**

In `frontend/src/features/contracts/formModel.test.ts`:

- Import `IDS` from `../../test/fixtures`.
- Replace every item `{ description: "Cobertura da cerimônia na igreja", amount_cents: X }` with `{ service_id: IDS.serviceCeremony, amount_cents: X }`.
- Replace `{ description: "Diária segundo fotógrafo", … }` with `{ service_id: IDS.serviceSecond, … }`.
- The defaults test expects `[{ service_id: "", amount_cents: "" }]`.
- The empty-form error list has `"payment.items.0.service_id"` in place of `"payment.items.0.description"`.
- In the `isFormField` table, use `["payment.items.1.service_id", 2, true]` and `["payment.items.2.service_id", 2, false]`.

Add:

```ts
test("every item needs a service, and a service appears once", () => {
  const values = validValues();
  values.payment.items[0]!.service_id = "";
  values.payment.items.push({ service_id: IDS.serviceSecond, amount_cents: "10" });
  expect(validate(values)).toMatchObject({
    "payment.items.0.service_id": "selecione um serviço",
    "payment.items.2.service_id": "serviço repetido no contrato",
  });
});
```

`validValues` is the existing helper that builds a valid `ContractFormValues`. If the file names it differently, use that name.

Run: `VITEST src/features/contracts/formModel.test.ts`
Expected: FAIL. `service_id` is undefined on items, and the error paths don't match.

- [ ] **Step 5: Change the item shape in `formModel.ts`**

```ts
export type ItemValues = { service_id: string; amount_cents: string };

export function emptyItem(): ItemValues {
  return { service_id: "", amount_cents: "" };
}
```

In `fromContract`:

```ts
      items: contract.payment.items.map((item) => ({
        service_id: item.service_id,
        amount_cents: formatBrlAmount(item.amount_cents),
      })),
```

In `toRequest`:

```ts
      items: values.payment.items.map((item) => ({
        service_id: item.service_id,
        amount_cents: parseBrl(item.amount_cents) ?? Number.NaN,
      })),
```

In `validate`, replace the items loop:

```ts
  const seen = new Set<string>();
  values.payment.items.forEach((item, index) => {
    if (item.service_id === "") {
      errors[`payment.items.${index}.service_id`] = "selecione um serviço";
    } else if (seen.has(item.service_id)) {
      errors[`payment.items.${index}.service_id`] = "serviço repetido no contrato";
    }
    seen.add(item.service_id);
    check(`payment.items.${index}.amount_cents`, amountError(item.amount_cents, true));
  });
```

```ts
const ITEM_FIELD = /^payment\.items\.(\d+)\.(service_id|amount_cents)$/;
```

Run: `VITEST src/features/contracts/formModel.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing `serviceOptions` test**

`frontend/src/features/contracts/serviceOptions.test.ts`:

```ts
import { IDS, SERVICES, makeService } from "../../test/fixtures";
import { serviceOptions } from "./serviceOptions";

test("lists active services by their current names", () => {
  expect(serviceOptions(SERVICES, []).map((o) => o.label)).toEqual([
    "Cobertura da cerimônia na igreja",
    "Diária segundo fotógrafo",
    "Ensaio de pré-wedding",
  ]);
});

test("an item already on the contract keeps its wording, archived ones are marked", () => {
  const renamed = SERVICES.map((s) =>
    s.id === IDS.serviceCeremony ? makeService({ name: "Cerimônia (novo nome)" }) : s,
  );
  const options = serviceOptions(renamed, [
    { service_id: IDS.serviceCeremony, description: "Cobertura da cerimônia na igreja" },
    { service_id: IDS.serviceArchived, description: "Álbum antigo" },
  ]);
  expect(options.map((o) => o.label)).toEqual([
    "Álbum antigo (arquivado)",
    "Cobertura da cerimônia na igreja",
    "Diária segundo fotógrafo",
    "Ensaio de pré-wedding",
  ]);
  expect(options[0]).toEqual({
    id: IDS.serviceArchived,
    label: "Álbum antigo (arquivado)",
    defaultPriceCents: 30000,
  });
});
```

Run: `VITEST src/features/contracts/serviceOptions.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 7: Implement `serviceOptions`**

`frontend/src/features/contracts/serviceOptions.ts`:

```ts
import type { ServiceOut } from "../../api/client";

export type ServiceOption = { id: string; label: string; defaultPriceCents: number };
export type SavedItem = { service_id: string; description: string };

/**
 * Active services, plus archived ones this contract already uses. A service already on
 * the contract is labelled with the contract's own wording, so the form matches the PDF.
 */
export function serviceOptions(services: ServiceOut[], savedItems: SavedItem[]): ServiceOption[] {
  const saved = new Map(savedItems.map((item) => [item.service_id, item.description]));
  return services
    .filter((service) => service.archived_at === null || saved.has(service.id))
    .map((service) => {
      const label = saved.get(service.id) ?? service.name;
      return {
        id: service.id,
        label: service.archived_at === null ? label : `${label} (arquivado)`,
        defaultPriceCents: service.default_price_cents,
      };
    });
}
```

Run: `VITEST src/features/contracts/serviceOptions.test.ts`
Expected: PASS.

- [ ] **Step 8: Add the `Select` UI component**

`frontend/src/ui/Select.tsx`:

```tsx
import type { Ref, SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

export function Select({ ref, ...rest }: Props) {
  return <select {...rest} ref={ref} className={styles.select} />;
}
```

`frontend/src/ui/Select.module.css`:

```css
.select {
  font: inherit;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
}
.select[aria-invalid="true"] {
  border-color: var(--color-danger);
}
.select:disabled {
  background: var(--color-bg);
  color: var(--color-text-muted);
}
```

In `frontend/src/ui/index.ts`, add `export { Select } from "./Select";`.

- [ ] **Step 9: Write the failing form tests**

In `frontend/src/features/contracts/ContractFormPage.create.test.tsx`:

- Change `EXPECTED_REQUEST.payment.items` to `[{ service_id: IDS.serviceCeremony, amount_cents: 120000 }, { service_id: IDS.serviceSecond, amount_cents: 50000 }]`.
- In `fillValidContract`, replace the four item lines (descriptions and amounts) with:

```ts
  await user.selectOptions(
    await screen.findByLabelText("Serviço do item 1"),
    "Cobertura da cerimônia na igreja",
  );
  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  await user.selectOptions(screen.getByLabelText("Serviço do item 2"), "Diária segundo fotógrafo");
```

Add these tests to the same file:

```ts
test("choosing a service fills its price, which stays editable", async () => {
  const { user } = renderApp("/contratos/novo");
  const amount = await screen.findByLabelText("Valor do item 1");
  await user.selectOptions(screen.getByLabelText("Serviço do item 1"), "Ensaio de pré-wedding");
  expect(amount).toHaveValue("800,00");
  await user.clear(amount);
  await user.type(amount, "650");
  await user.tab();
  expect(amount).toHaveValue("650,00");
  await user.selectOptions(screen.getByLabelText("Serviço do item 1"), "Diária segundo fotógrafo");
  expect(amount).toHaveValue("500,00");
});

test("a service chosen in one row is disabled in the others", async () => {
  const { user } = renderApp("/contratos/novo");
  await user.selectOptions(
    await screen.findByLabelText("Serviço do item 1"),
    "Diária segundo fotógrafo",
  );
  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  const second = screen.getByLabelText("Serviço do item 2");
  expect(within(second).getByRole("option", { name: "Diária segundo fotógrafo" })).toBeDisabled();
  expect(within(second).queryByRole("option", { name: /Álbum antigo/ })).toBeNull();
});

test("with no services, the form links to the catalog", async () => {
  server.use(servicesHandler([]));
  renderApp("/contratos/novo");
  expect(await screen.findByRole("link", { name: "Cadastre os serviços" })).toHaveAttribute(
    "href",
    "/servicos",
  );
});

test("a server error on a service lands on that row", async () => {
  server.use(
    http.post("/api/v1/contracts", () =>
      problem(422, "Request validation failed", {
        errors: [{ field: "payment.items.1.service_id", message: "serviço arquivado" }],
      }),
    ),
  );
  const { user } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("serviço arquivado")).toBeInTheDocument();
  expect(screen.getByLabelText("Serviço do item 2")).toHaveAttribute("aria-invalid", "true");
});
```

Add `servicesHandler` to the fixtures import.

In `frontend/src/features/contracts/ContractFormPage.edit.test.tsx`:
- In "a changed item list is sent whole", expect `items: [{ service_id: IDS.serviceCeremony, amount_cents: 120000 }]`.
- Add:

```ts
test("an old contract keeps its archived service under its own wording", async () => {
  serveContract(
    makeContract({
      payment: {
        items: [
          { service_id: IDS.serviceArchived, description: "Álbum de luxo", amount_cents: 30000 },
        ],
        pix_discount_cents: null,
        total_cents: 30000,
      },
    }),
  );
  renderApp(URL_PATH);
  const select = await screen.findByLabelText("Serviço do item 1");
  expect(select).toHaveDisplayValue("Álbum de luxo (arquivado)");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});
```

Run: `VITEST src/features/contracts`
Expected: FAIL, because there is no "Serviço do item 1" select.

- [ ] **Step 10: Build `ServiceField` and the new `PaymentSection`**

`frontend/src/features/contracts/sections/ServiceField.tsx`:

```tsx
import { type UseFormReturn, get } from "react-hook-form";
import { formatBrlAmount } from "../../../domain/money";
import { Field, Select } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import type { ServiceOption } from "../serviceOptions";

type Props = {
  form: UseFormReturn<ContractFormValues>;
  index: number;
  options: ServiceOption[];
  /** Services chosen in other rows. */
  taken: ReadonlySet<string>;
};

export function ServiceField({ form, index, options, taken }: Props) {
  const name = `payment.items.${index}.service_id` as const;
  const amount = `payment.items.${index}.amount_cents` as const;
  const error = (get(form.formState.errors, name) as { message?: string } | undefined)?.message;
  const registration = form.register(name, {
    // A native select only fires change for a different option, so re-picking keeps a typed price.
    onChange: (event: { target: { value: string } }) => {
      const option = options.find((candidate) => candidate.id === event.target.value);
      if (!option) return;
      form.setValue(amount, formatBrlAmount(option.defaultPriceCents), {
        shouldDirty: true,
        shouldValidate: Boolean(get(form.formState.errors, amount)),
      });
    },
  });
  return (
    <Field label={`Serviço do item ${index + 1}`} error={error}>
      {(control) => (
        <Select {...control} {...registration}>
          <option value="">Selecione um serviço</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={taken.has(option.id)}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
```

`frontend/src/features/contracts/sections/PaymentSection.tsx`:

```tsx
import { Link } from "react-router";
import { useServices } from "../../../api/services";
import { formatBrl } from "../../../domain/money";
import { Banner, Button, FormSection } from "../../../ui";
import styles from "../ContractForm.module.css";
import { moneyText } from "../formModel";
import { type SavedItem, serviceOptions } from "../serviceOptions";
import type { ContractFormState } from "../useContractForm";
import { ServiceField } from "./ServiceField";
import { TextField } from "./TextField";

type Props = { state: ContractFormState; disabled: boolean; savedItems: SavedItem[] };

export function PaymentSection({ state, disabled, savedItems }: Props) {
  const { form, items } = state;
  const services = useServices(true);

  if (services.isPending) {
    return (
      <FormSection title="Pagamento" disabled>
        <p className={styles.row}>Carregando serviços…</p>
      </FormSection>
    );
  }
  if (services.isError) {
    return (
      <FormSection title="Pagamento" disabled={disabled}>
        <div className={styles.row}>
          <Banner tone="error">
            Não foi possível carregar os serviços.{" "}
            <Button onClick={() => void services.refetch()}>Tentar de novo</Button>
          </Banner>
        </div>
      </FormSection>
    );
  }

  const options = serviceOptions(services.data, savedItems);
  if (options.length === 0) {
    return (
      <FormSection title="Pagamento" disabled={disabled}>
        <p className={styles.row}>
          Nenhum serviço cadastrado. <Link to="/servicos">Cadastre os serviços</Link> antes de
          criar o contrato.
        </p>
      </FormSection>
    );
  }

  const chosen = state.values.payment.items.map((item) => item.service_id);
  return (
    <FormSection title="Pagamento" disabled={disabled}>
      {items.fields.map((field, index) => (
        <div key={field.id} className={styles.item}>
          <ServiceField
            form={form}
            index={index}
            options={options}
            taken={new Set(chosen.filter((id, other) => other !== index && id !== ""))}
          />
          <TextField
            form={form}
            name={`payment.items.${index}.amount_cents`}
            label={`Valor do item ${index + 1}`}
            adornment="R$"
            inputMode="decimal"
            format={moneyText}
          />
          <Button
            variant="ghost"
            aria-label={`Remover item ${index + 1}`}
            disabled={items.fields.length === 1}
            onClick={() => state.removeItem(index)}
          >
            Remover
          </Button>
        </div>
      ))}
      <div className={styles.row}>
        <Button onClick={state.addItem} disabled={!state.canAddItem}>
          Adicionar item
        </Button>
      </div>
      <TextField
        form={form}
        name="payment.pix_discount_cents"
        label="Desconto PIX"
        hint="Opcional"
        adornment="R$"
        inputMode="decimal"
        format={moneyText}
      />
      <p className={styles.row}>
        Total: <strong>{state.total === null ? "—" : formatBrl(state.total)}</strong>
      </p>
    </FormSection>
  );
}
```

In `ContractForm.tsx`:
- Add `savedItems?: SavedItem[]` to `Props`, imported from `./serviceOptions`.
- Destructure it with default `savedItems = []`.
- Render `<PaymentSection state={state} disabled={readOnly} savedItems={savedItems} />`.

In `EditContract.tsx`, pass `savedItems={data.payment.items}` to `ContractForm`.

- [ ] **Step 11: Run the frontend checks**

Run: `cd frontend && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS. If the edit test that checks "nothing to save yet" fails because RHF marks the select dirty on mount, confirm that `toRequest(initialValues)` equals `toRequest(form values)`. `hasChanges` compares requests, so it should pass.

- [ ] **Step 12: Point the e2e helpers at the catalog**

In `frontend/e2e/helpers.ts`:
- Change the base fixture to also seed services before every test.
- Change `fillContract` to pick services.

```ts
const SERVICES = [
  { name: "Cobertura da cerimônia na igreja", default_price_cents: 120000, is_prewedding: false },
  { name: "Diária segundo fotógrafo", default_price_cents: 50000, is_prewedding: false },
];

// Every test fails on any browser console error, which is where CSP violations appear.
// Every test also starts with the services the contract helpers pick (409 means already there).
export const test = base.extend<{ consoleErrors: string[]; services: void }>({
  consoleErrors: [
    /* unchanged */
  ],
  services: [
    async ({ request, baseURL }, use) => {
      for (const service of SERVICES) {
        const response = await request.post("/api/v1/services", {
          data: service,
          headers: { Origin: baseURL! },
        });
        expect([201, 409]).toContain(response.status());
      }
      await use();
    },
    { auto: true },
  ],
});
```

In `fillContract`, replace the item lines with:

```ts
  await page.getByLabel("Serviço do item 1").selectOption({ label: "Cobertura da cerimônia na igreja" });
  await page.getByLabel("Valor do item 1").fill("1.200,00");
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 2").selectOption({ label: "Diária segundo fotógrafo" });
  await page.getByLabel("Valor do item 2").fill("500");
```

Export `uniqueSuffix` (Task 6 uses it).

Run: `make e2e`
Expected: 5 of 5 pass.

- [ ] **Step 13: Commit**

```bash
git add frontend
git commit -m "feat: pick contract items from the service catalog"
```

---

### Task 5: Services screen

**Files:**
- Create:
  - `frontend/src/features/services/messages.ts`
  - `frontend/src/features/services/serviceForm.ts`
  - `frontend/src/features/services/serviceForm.test.ts`
  - `frontend/src/features/services/ServiceDialog.tsx`
  - `frontend/src/features/services/ServiceListPage.tsx`
  - `frontend/src/features/services/ServiceListPage.module.css`
  - `frontend/src/features/services/ServiceListPage.test.tsx`
- Modify: `frontend/src/app/routes.tsx`

**Interfaces:**
- Consumes: the hooks and types from Task 4, plus `textError`/`amountError` and the `ui` components.
- Produces: the `/servicos` route and the "Serviços" nav link.

- [ ] **Step 1: Write the failing `serviceForm` test**

`frontend/src/features/services/serviceForm.test.ts`:

```ts
import { makeService } from "../../test/fixtures";
import { emptyServiceValues, serviceValues, toServiceRequest, validateService } from "./serviceForm";

test("starts empty, or from a service", () => {
  expect(emptyServiceValues()).toEqual({ name: "", price: "", isPrewedding: false });
  expect(serviceValues(makeService({ is_prewedding: true }))).toEqual({
    name: "Cobertura da cerimônia na igreja",
    price: "1.200,00",
    isPrewedding: true,
  });
});

test("checks the name and the price like the API", () => {
  expect(validateService({ name: " ", price: "", isPrewedding: false })).toEqual({
    name: "campo obrigatório",
    default_price_cents: "campo obrigatório",
  });
  expect(validateService({ name: "x".repeat(201), price: "0", isPrewedding: false })).toEqual({
    name: "máximo de 200 caracteres",
    default_price_cents: "o valor deve ser maior que zero",
  });
  expect(validateService({ name: "Álbum", price: "1.500", isPrewedding: true })).toEqual({});
});

test("builds the request with a trimmed name and cents", () => {
  expect(toServiceRequest({ name: "  Álbum ", price: "1.500,50", isPrewedding: true })).toEqual({
    name: "Álbum",
    default_price_cents: 150050,
    is_prewedding: true,
  });
});
```

Run: `VITEST src/features/services/serviceForm.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 2: Implement `serviceForm.ts` and `messages.ts`**

`frontend/src/features/services/serviceForm.ts`:

```ts
import type { ServiceIn, ServiceOut } from "../../api/client";
import { amountError, textError } from "../../domain/fieldRules";
import { formatBrlAmount, parseBrl } from "../../domain/money";

export type ServiceValues = { name: string; price: string; isPrewedding: boolean };
export type ServiceErrors = Partial<Record<"name" | "default_price_cents", string>>;

export function emptyServiceValues(): ServiceValues {
  return { name: "", price: "", isPrewedding: false };
}

export function serviceValues(service: ServiceOut): ServiceValues {
  return {
    name: service.name,
    price: formatBrlAmount(service.default_price_cents),
    isPrewedding: service.is_prewedding,
  };
}

export function validateService(values: ServiceValues): ServiceErrors {
  const errors: ServiceErrors = {};
  const name = textError(values.name, 200, true);
  const price = amountError(values.price, true);
  if (name) errors.name = name;
  if (price) errors.default_price_cents = price;
  return errors;
}

export function toServiceRequest(values: ServiceValues): ServiceIn {
  return {
    name: values.name.trim(),
    default_price_cents: parseBrl(values.price) ?? Number.NaN,
    is_prewedding: values.isPrewedding,
  };
}
```

`frontend/src/features/services/messages.ts`:

```ts
export const NAME_TAKEN = "Já existe um serviço ativo com este nome.";
export const SERVICE_CHANGED =
  "Este serviço foi alterado em outro lugar. Feche e abra de novo para ver a versão atual.";
export const SERVICE_GONE = "Este serviço não existe mais. A lista foi atualizada.";
export const ARCHIVE_CONFLICT = "Este serviço já estava arquivado. A lista foi atualizada.";
export const RESTORE_CONFLICT =
  "Não foi possível restaurar: já existe um serviço ativo com este nome, ou ele já foi restaurado.";
```

Run: `VITEST src/features/services/serviceForm.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing page tests**

`frontend/src/features/services/ServiceListPage.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeService, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("lists active services, and archived ones on request", async () => {
  const { user } = renderApp("/servicos");
  const table = await screen.findByRole("table", { name: "Serviços" });
  expect(within(table).getByText("Cobertura da cerimônia na igreja")).toBeInTheDocument();
  expect(within(table).getByText("R$ 1.200,00")).toBeInTheDocument();
  expect(within(table).queryByText(/Álbum antigo/)).toBeNull();
  const prewedding = within(table).getByRole("row", { name: /Ensaio de pré-wedding/ });
  expect(within(prewedding).getByText("Sim")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Mostrar arquivados"));
  const archived = await screen.findByRole("row", { name: /Álbum antigo/ });
  expect(within(archived).getByRole("button", { name: "Restaurar" })).toBeInTheDocument();
});

test("the nav links to the services screen", async () => {
  const { user } = renderApp("/contratos");
  await user.click(await screen.findByRole("link", { name: "Serviços" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Serviços" })).toBeInTheDocument();
});

test("creates a service", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/services", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(makeService({ id: "new", name: "Drone" }), { status: 201 });
    }),
  );
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByRole("button", { name: "Novo serviço" }));
  const dialog = screen.getByRole("dialog", { name: "Novo serviço" });
  await user.type(within(dialog).getByLabelText("Nome"), "Drone");
  await user.type(within(dialog).getByLabelText("Preço padrão"), "400");
  await user.click(within(dialog).getByLabelText("Ensaio de pré-wedding"));
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Serviço criado")).toBeInTheDocument();
  expect(sent).toEqual({ name: "Drone", default_price_cents: 40000, is_prewedding: true });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("validates before sending", async () => {
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByRole("button", { name: "Novo serviço" }));
  const dialog = screen.getByRole("dialog", { name: "Novo serviço" });
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getAllByText("campo obrigatório")).toHaveLength(2);
});

test("a name conflict shows on the name field", async () => {
  server.use(http.post("/api/v1/services", () => problem(409, "taken")));
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByRole("button", { name: "Novo serviço" }));
  const dialog = screen.getByRole("dialog", { name: "Novo serviço" });
  await user.type(within(dialog).getByLabelText("Nome"), "Diária segundo fotógrafo");
  await user.type(within(dialog).getByLabelText("Preço padrão"), "500");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await within(dialog).findByText("Já existe um serviço ativo com este nome.")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
});

test("edits with If-Match, and a stale version shows a banner", async () => {
  let ifMatch: string | null = null;
  server.use(
    http.patch("/api/v1/services/:id", ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return problem(412, "The service changed since it was loaded");
    }),
  );
  const { user } = renderApp("/servicos");
  const row = await screen.findByRole("row", { name: /Diária segundo fotógrafo/ });
  await user.click(within(row).getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog", { name: "Editar serviço" });
  expect(within(dialog).getByLabelText("Preço padrão")).toHaveValue("500,00");
  await user.clear(within(dialog).getByLabelText("Preço padrão"));
  await user.type(within(dialog).getByLabelText("Preço padrão"), "550");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(
    await within(dialog).findByText(
      "Este serviço foi alterado em outro lugar. Feche e abra de novo para ver a versão atual.",
    ),
  ).toBeInTheDocument();
  expect(ifMatch).toBe('"1"');
});

test("archives and restores from the row", async () => {
  const archived: string[] = [];
  const restored: string[] = [];
  server.use(
    http.post("/api/v1/services/:id/archive", ({ params }) => {
      archived.push(String(params.id));
      return HttpResponse.json(makeService({ archived_at: "2026-10-14T12:00:00Z", version: 2 }));
    }),
    http.post("/api/v1/services/:id/restore", ({ params }) => {
      restored.push(String(params.id));
      return HttpResponse.json(makeService({ id: IDS.serviceArchived }));
    }),
  );
  const { user } = renderApp("/servicos");
  const row = await screen.findByRole("row", { name: /Cobertura da cerimônia/ });
  await user.click(within(row).getByRole("button", { name: "Arquivar" }));
  expect(await screen.findByText("Serviço arquivado")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Mostrar arquivados"));
  const old = await screen.findByRole("row", { name: /Álbum antigo/ });
  await user.click(within(old).getByRole("button", { name: "Restaurar" }));
  expect(await screen.findByText("Serviço restaurado")).toBeInTheDocument();
  await waitFor(() => expect(archived).toEqual([IDS.serviceCeremony]));
  expect(restored).toEqual([IDS.serviceArchived]);
});

test("a restore conflict is explained", async () => {
  server.use(http.post("/api/v1/services/:id/restore", () => problem(409, "taken")));
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByLabelText("Mostrar arquivados"));
  const old = await screen.findByRole("row", { name: /Álbum antigo/ });
  await user.click(within(old).getByRole("button", { name: "Restaurar" }));
  expect(
    await screen.findByText(
      "Não foi possível restaurar: já existe um serviço ativo com este nome, ou ele já foi restaurado.",
    ),
  ).toBeInTheDocument();
});
```

Run: `VITEST src/features/services`
Expected: FAIL. `/servicos` renders the not-found page.

- [ ] **Step 4: Implement `ServiceDialog`**

`frontend/src/features/services/ServiceDialog.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import { ApiError, type ServiceOut } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { useCreateService, useUpdateService } from "../../api/services";
import { moneyText } from "../contracts/formModel";
import {
  Banner,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  Field,
  TextInput,
  useToast,
} from "../../ui";
import { NAME_TAKEN, SERVICE_CHANGED, SERVICE_GONE } from "./messages";
import {
  type ServiceErrors,
  type ServiceValues,
  emptyServiceValues,
  serviceValues,
  toServiceRequest,
  validateService,
} from "./serviceForm";

type Props = { service: ServiceOut | null; onClose: () => void };

export function ServiceDialog({ service, onClose }: Props) {
  const notify = useToast();
  const create = useCreateService();
  const update = useUpdateService();
  const [values, setValues] = useState<ServiceValues>(() =>
    service ? serviceValues(service) : emptyServiceValues(),
  );
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const set = (patch: Partial<ServiceValues>) => setValues((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validateService(values);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    const body = toServiceRequest(values);
    try {
      if (service) await update.mutateAsync({ id: service.id, version: service.version, body });
      else await create.mutateAsync(body);
      notify(service ? "Serviço atualizado" : "Serviço criado");
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.status === 409) setErrors({ name: NAME_TAKEN });
      else if (error.status === 412) setBanner(SERVICE_CHANGED);
      else if (error.status === 404) setBanner(SERVICE_GONE);
      else if (error.status === 422) {
        const mapped: ServiceErrors = {};
        const other: string[] = [];
        for (const { field, message } of error.errors) {
          if (field === "name" || field === "default_price_cents") mapped[field] = message;
          else other.push(field ? `${field}: ${message}` : message);
        }
        setErrors(mapped);
        if (other.length > 0) setBanner(other.join(" "));
      } else if (!isUnexpected(error)) setBanner(describeUnexpected(error));
    }
  };

  return (
    <Dialog open title={service ? "Editar serviço" : "Novo serviço"} onClose={onClose}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        {banner && <Banner tone="error">{banner}</Banner>}
        <Field label="Nome" error={errors.name}>
          {(control) => (
            <TextInput
              {...control}
              value={values.name}
              onChange={(event) => set({ name: event.target.value })}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Preço padrão" error={errors.default_price_cents}>
          {(control) => (
            <TextInput
              {...control}
              value={values.price}
              adornment="R$"
              inputMode="decimal"
              onChange={(event) => set({ price: event.target.value })}
              onBlur={(event) => set({ price: moneyText(event.target.value) })}
              autoComplete="off"
            />
          )}
        </Field>
        <Checkbox
          label="Ensaio de pré-wedding"
          checked={values.isPrewedding}
          onChange={(checked) => set({ isPrewedding: checked })}
        />
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" busy={busy}>
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
```

`moneyText` comes from the contracts feature. If a reviewer objects to the cross-feature import, move `moneyText` into `domain/money.ts` and re-export it from `formModel.ts`.

- [ ] **Step 5: Implement `ServiceListPage` and the route**

`frontend/src/features/services/ServiceListPage.module.css`:

```css
.toolbar {
  margin-bottom: var(--space-3);
}
.actions {
  display: inline-flex;
  gap: var(--space-2);
}
.tag {
  color: var(--color-text-muted);
}
```

`frontend/src/features/services/ServiceListPage.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, type ServiceOut } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { serviceKeys } from "../../api/keys";
import { useArchiveService, useRestoreService, useServices } from "../../api/services";
import { formatBrl } from "../../domain/money";
import { Banner, Button, Checkbox, type Column, PageLayout, Table, useToast } from "../../ui";
import { ServiceDialog } from "./ServiceDialog";
import styles from "./ServiceListPage.module.css";
import { ARCHIVE_CONFLICT, RESTORE_CONFLICT, SERVICE_GONE } from "./messages";

export function ServiceListPage() {
  const notify = useToast();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ServiceOut | "new" | null>(null);
  const services = useServices(showArchived);
  const archive = useArchiveService();
  const restore = useRestoreService();

  const onRowError = (conflictText: string) => (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 409) notify(conflictText, { tone: "error" });
    else if (error.status === 404) notify(SERVICE_GONE, { tone: "error" });
    else if (!isUnexpected(error)) notify(describeUnexpected(error), { tone: "error" });
    void queryClient.invalidateQueries({ queryKey: serviceKeys.all });
  };

  const newService = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      Novo serviço
    </Button>
  );

  const columns: Column<ServiceOut>[] = [
    {
      header: "Nome",
      cell: (service) => (
        <>
          {service.name}
          {service.archived_at && <span className={styles.tag}> · Arquivado</span>}
        </>
      ),
    },
    { header: "Preço padrão", align: "end", cell: (service) => formatBrl(service.default_price_cents) },
    { header: "Pré-wedding", cell: (service) => (service.is_prewedding ? "Sim" : "Não") },
    {
      header: "Ações",
      align: "end",
      cell: (service) =>
        service.archived_at ? (
          <Button
            onClick={() =>
              restore.mutate(service.id, {
                onSuccess: () => notify("Serviço restaurado"),
                onError: onRowError(RESTORE_CONFLICT),
              })
            }
            busy={restore.isPending && restore.variables === service.id}
          >
            Restaurar
          </Button>
        ) : (
          <span className={styles.actions}>
            <Button onClick={() => setEditing(service)}>Editar</Button>
            <Button
              onClick={() =>
                archive.mutate(service.id, {
                  onSuccess: () => notify("Serviço arquivado"),
                  onError: onRowError(ARCHIVE_CONFLICT),
                })
              }
              busy={archive.isPending && archive.variables === service.id}
            >
              Arquivar
            </Button>
          </span>
        ),
    },
  ];

  return (
    <PageLayout title="Serviços" actions={newService}>
      <div className={styles.toolbar}>
        <Checkbox label="Mostrar arquivados" checked={showArchived} onChange={setShowArchived} />
      </div>
      {services.isPending && <p>Carregando…</p>}
      {services.isError && (
        <Banner tone="error">
          Não foi possível carregar os serviços.{" "}
          <Button onClick={() => void services.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {services.isSuccess && (
        <Table
          label="Serviços"
          columns={columns}
          rows={services.data}
          rowKey={(service) => service.id}
          rowMuted={(service) => service.archived_at !== null}
          empty={
            <>
              <p>Nenhum serviço ainda</p>
              {newService}
            </>
          }
        />
      )}
      {editing !== null && (
        <ServiceDialog
          key={editing === "new" ? "new" : `${editing.id}-${editing.version}`}
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageLayout>
  );
}
```

In `frontend/src/app/routes.tsx`:
- Import `ServiceListPage`.
- Add `{ to: "/servicos", label: "Serviços" }` to `LINKS`, after "Clientes".
- Add the route `{ path: "servicos", element: <ServiceListPage /> }` before the catch-all.

- [ ] **Step 6: Run the frontend checks**

Run: `cd frontend && npm run format && npm run typecheck && npm run lint && npx vitest run --coverage`
Expected: PASS, with line coverage ≥ 80%.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat: add the Serviços screen to manage the service catalog"
```

---

### Task 6: End-to-end test, README and final checks

**Files:**
- Create: `frontend/e2e/services.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `freshCouple`, `fillContract`, `uniqueSuffix` and `test`/`expect` from `e2e/helpers.ts` (Task 4).

- [ ] **Step 1: Write the end-to-end test**

`frontend/e2e/services.spec.ts`:

```ts
import { expect, fillContract, freshCouple, test, uniqueSuffix } from "./helpers";

test("a renamed service keeps its old wording on a contract that already uses it", async ({
  page,
}) => {
  const name = `Drone ${uniqueSuffix()}`;
  await page.goto("/servicos");
  await page.getByRole("button", { name: "Novo serviço" }).click();
  const create = page.getByRole("dialog", { name: "Novo serviço" });
  await create.getByLabel("Nome").fill(name);
  await create.getByLabel("Preço padrão").fill("750");
  await create.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado")).toBeVisible();

  await page.goto("/contratos/novo");
  await fillContract(page, freshCouple());
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: name });
  await expect(page.getByLabel("Valor do item 3")).toHaveValue("750,00");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await download;
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const contractUrl = page.url();
  const contractId = contractUrl.split("/").pop()!;

  await page.goto("/servicos");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar serviço" });
  await edit.getByLabel("Nome").fill(`${name} Premium`);
  await edit.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço atualizado")).toBeVisible();

  await page.goto(contractUrl);
  await page.getByLabel("Local do evento").fill("Capela Santa Luzia");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();
  await expect(page.getByLabel("Serviço do item 3").locator("option:checked")).toHaveText(name);

  const saved = await (await page.request.get(`/api/v1/contracts/${contractId}`)).json();
  expect(saved.payment.items[2].description).toBe(name);
});
```

- [ ] **Step 2: Run the end-to-end suite**

Run: `make e2e`
Expected: 6 of 6 pass.

- [ ] **Step 3: Document the screen in the README**

In `README.md`, after the paragraph that starts "Open <http://127.0.0.1:8000>.", add:

```markdown
Contract items are picked from the services on the **Serviços** screen, so
add your services there before creating the first contract. Each contract keeps
its own copy of an item's name and price: renaming a service or changing its
price only affects items added afterwards, and archiving a service hides it from
new contracts without changing those that already use it. Mark a service as
"Ensaio de pré-wedding" when it is a pre-wedding shoot.

The first start after upgrading creates one service for each distinct item
description already in your contracts, priced at its most recent amount, and
marks those whose name contains "pré-wedding" as pre-wedding shoots. Check the
**Serviços** screen afterwards.
```

- [ ] **Step 4: Run every check**

Run: `make check && make e2e`
Expected: both pass. `npm audit` may report the three known moderate Vitest advisories, which are below the `high` threshold.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e README.md
git commit -m "test: drive the service catalog end to end and document the Serviços screen"
```
