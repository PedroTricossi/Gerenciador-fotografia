# Pre-wedding Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a contract that includes a pre-wedding service carry one optional pre-wedding event (date, place, optional address and start time), entered at creation or scheduled later from the contracts list without editing the contract.

**Architecture:** A new `prewedding_events` table (at most one row per contract) with its own version, audit actions and `/api/v1/contracts/{id}/prewedding` endpoint, served by a new `PreweddingService`. `ContractService` creates the row when a contract is created with one, cancels it when an edit removes the last pre-wedding item with `cancel_prewedding: true`, and reports `has_prewedding` / `prewedding` in its views. The frontend adds a pré-wedding dialog to the contracts list and a pré-wedding section to the contract form.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (SQLite), Pydantic 2, pytest; React 19, TanStack Query v5, React Hook Form, openapi-fetch, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-prewedding-event-design.md`

## Global Constraints

- Branch `feat/prewedding-event`, based on `main`.
- The pre-wedding never appears in the contract PDF.
- Pre-wedding operations never change the contract's version, ETag or audit trail, except a cancellation done by a contract `PATCH`.
- At most one pre-wedding per contract. Cancelling deletes the row; scheduling again starts at version 1.
- Eligibility = contract not soft-deleted and at least one item whose service has `is_prewedding = true`. Checked on schedule/change, never on cancel.
- No rule ties the pre-wedding date to the wedding date or to today.
- Constraint names: `uq_prewedding_events_contract_id`, `fk_prewedding_events_contract_id_contracts`.
- Audit actions `prewedding.scheduled` (`{"version": 1, "contract_id": …}`), `prewedding.updated` (`{"version": n, "fields": [...]}`), `prewedding.cancelled` (`{"version": n}` plus `"via": "contract_update"` when done by a contract edit). Details never contain dates, places, addresses or times.
- Error messages (verbatim): `"contrato não encontrado"`, `"pré-wedding não agendado"`, `"este contrato não inclui pré-wedding"`, `"inclua um serviço de pré-wedding"`; 412 detail `"The prewedding changed since it was loaded"`; 409 problem `code: "prewedding_scheduled"`.
- ETag `"<version>"`; `If-Match` missing → 428, stale or malformed → 412. Exception: `PUT` when nothing is scheduled ignores `If-Match` entirely.
- UI copy (verbatim): hint `"Pode deixar em branco e agendar depois."`; summary `"Pré-wedding: 12/03/2027 às 16:00 · Parque Barigui"` / `"Pré-wedding: não agendado"`; removal text `"Este contrato tem um pré-wedding agendado em 12/03/2027. Remover o item cancela esse agendamento."` with buttons **Voltar** / **Remover e salvar**; list buttons `"Agendar pré-wedding"` / `"Pré-wedding 12/03"`; dialog buttons **Salvar**, **Cancelar**, **Desmarcar pré-wedding**; 412 message `"O pré-wedding mudou desde que foi aberto. Os dados foram recarregados."`.
- `openapi.json` is gitignored: regenerate with `make api-types`, commit only `frontend/src/api/schema.d.ts`.
- `make check` and `make e2e` must pass at the end. `assert` is banned in `backend/src` (ruff S101).

## Review Focus

1. **A service un-marked as pre-wedding after scheduling:** later contract edits (even ones that drop that item) must not raise the 409, the schedule stays, and the list still offers the button so it can be cancelled. Tests: Task 2 `test_edits_after_unmarking_the_service_keep_the_schedule`, Task 4 "orphan" row in the button-label test.
2. **Values typed into the pré-wedding section, then the pre-wedding item swapped for another service:** the hidden values must not be sent. Test: Task 5 `"hidden pre-wedding values are not sent"`.
3. **A soft-deleted contract:** reports `has_prewedding: false` / `prewedding: null`, shows no list button, and gets its schedule back on restore. Tests: Task 2 `test_a_deleted_contract_reports_no_prewedding_until_restored`, Task 3 `test_list_rows_carry_the_prewedding`.
4. **Swapping one pre-wedding service for another pre-wedding service:** no 409, schedule kept. Test: Task 2 `test_swapping_prewedding_services_keeps_the_schedule`.
5. **Retrying in the dialog after a 412:** the retry must send the fresh version, and the fields show the reloaded data. Test: Task 4 `"a stale version reloads the dialog and the retry sends the new version"`.

---

### Task 1: Pre-wedding table and service

**Files:**
- Modify: `backend/src/gerenciador/services/exceptions.py`
- Modify: `backend/src/gerenciador/db/models.py`
- Create: `backend/migrations/versions/0003_prewedding_events.py`
- Create: `backend/src/gerenciador/services/prewedding_service.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/db/test_database.py:24-26`
- Create: `backend/tests/db/test_migration_0003.py`
- Create: `backend/tests/services/test_prewedding_service.py`

**Interfaces:**
- Consumes: `ContractRepository.get`, `AuditService.record`, `utcnow`, `Contract.items[*].service.is_prewedding` (all existing).
- Produces:
  - `NotFoundError(entity: str, entity_id: str, message: str | None = None)`; `ConflictError(message: str, code: str | None = None)` with `.code`; new `PreconditionRequiredError()`.
  - Model `PreweddingEvent` and `Contract.prewedding: PreweddingEvent | None` (cascade delete-orphan, so `contract.prewedding = None` deletes the row).
  - In `gerenciador.services.prewedding_service`: `ENTITY = "prewedding"`, `PreweddingInput(event_date, venue_name, venue_address, start_time)`, `PreweddingView(id, contract_id, event_date, venue_name, venue_address, start_time, version)`, `includes_prewedding(items) -> bool`, `prewedding_view(row) -> PreweddingView`, `new_prewedding(data) -> PreweddingEvent`, `record_scheduled(audit, ctx, row) -> None`, `record_cancelled(audit, ctx, row, *, via: str | None = None) -> None`, and `PreweddingService(session, audit)` with `get(contract_id) -> PreweddingView`, `schedule(ctx, contract_id, expected_version: int | None, data) -> tuple[PreweddingView, bool]` (bool = created), `cancel(ctx, contract_id, expected_version: int) -> None`.
  - pytest fixture `preweddings` (a `PreweddingService`) in `tests/conftest.py`.

- [ ] **Step 1: Extend the exceptions**

In `backend/src/gerenciador/services/exceptions.py`, replace `NotFoundError` and `ConflictError` and add `PreconditionRequiredError` after `StaleVersionError`:

```python
class NotFoundError(Exception):
    def __init__(self, entity: str, entity_id: str, message: str | None = None) -> None:
        super().__init__(message or f"{entity} not found")
        self.entity = entity
        self.entity_id = entity_id


class ConflictError(Exception):
    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
```

```python
class PreconditionRequiredError(Exception):
    """An edit of something that exists was sent without the version it was based on."""
```

- [ ] **Step 2: Write the failing migration tests**

`backend/tests/db/test_database.py`, in `test_migrations_create_all_tables`, add `"prewedding_events"` to the expected set:

```python
    assert {
        "clients",
        "contracts",
        "contract_items",
        "audit_events",
        "services",
        "prewedding_events",
    } <= tables
```

Create `backend/tests/db/test_migration_0003.py`:

```python
"""Migration 0003 adds the pre-wedding table and touches no existing data."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0002")
    engine = create_engine(url)
    with engine.begin() as conn:
        for role in ("g", "b"):
            conn.execute(
                text(
                    "INSERT INTO clients (id, full_name, created_at, updated_at)"
                    " VALUES (:id, 'Pessoa', '2026-01-01 10:00:00', '2026-01-01 10:00:00')"
                ),
                {"id": f"c1{role}"},
            )
        conn.execute(
            text(
                "INSERT INTO contracts (id, groom_id, bride_id, event_date, venue_name,"
                " photographer_count, signing_city, signing_date, version, created_at,"
                " updated_at) VALUES ('c1', 'c1g', 'c1b', '2027-03-14', 'Igreja', 2,"
                " 'Curitiba', '2026-10-13', 1, '2026-01-01 10:00:00', '2026-01-01 10:00:00')"
            )
        )
    yield config, engine
    engine.dispose()


def _contracts(engine: Engine) -> list[tuple[str, int]]:
    with engine.connect() as conn:
        return [
            tuple(row)
            for row in conn.execute(text("SELECT id, version FROM contracts"))
        ]


def test_upgrade_adds_an_empty_table_and_keeps_contracts(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    command.upgrade(config, "head")

    inspector = inspect(engine)
    assert "prewedding_events" in inspector.get_table_names()
    assert [
        c["name"] for c in inspector.get_unique_constraints("prewedding_events")
    ] == ["uq_prewedding_events_contract_id"]
    with engine.connect() as conn:
        assert (
            conn.execute(text("SELECT COUNT(*) FROM prewedding_events")).scalar() == 0
        )
    assert _contracts(engine) == [("c1", 1)]


def test_downgrade_drops_the_table_and_keeps_contracts(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    command.upgrade(config, "head")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO prewedding_events (id, contract_id, event_date, venue_name,"
                " version, created_at, updated_at) VALUES ('p1', 'c1', '2027-01-20',"
                " 'Parque', 1, '2026-01-02 10:00:00', '2026-01-02 10:00:00')"
            )
        )
    command.downgrade(config, "0002")

    assert "prewedding_events" not in inspect(engine).get_table_names()
    assert _contracts(engine) == [("c1", 1)]
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd backend && uv run pytest tests/db -q`
Expected: FAIL — `prewedding_events` does not exist and revision `0002` is still head.

- [ ] **Step 4: Add the model and the migration**

In `backend/src/gerenciador/db/models.py`, add to `Contract` (after `items`):

```python
    # One-to-one: setting this to None deletes the row.
    prewedding: Mapped["PreweddingEvent | None"] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
```

and add the model after `ContractItem`:

```python
class PreweddingEvent(Base):
    __tablename__ = "prewedding_events"
    __table_args__ = (
        UniqueConstraint("contract_id", name="uq_prewedding_events_contract_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    contract_id: Mapped[str] = mapped_column(
        ForeignKey("contracts.id", name="fk_prewedding_events_contract_id_contracts")
    )
    event_date: Mapped[dt.date]
    venue_name: Mapped[str] = mapped_column(String(200))
    venue_address: Mapped[str | None] = mapped_column(String(300))
    start_time: Mapped[dt.time | None]
    version: Mapped[int]
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
```

Create `backend/migrations/versions/0003_prewedding_events.py`:

```python
"""pre-wedding events: an optional second shoot per contract

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prewedding_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "contract_id",
            sa.String(36),
            sa.ForeignKey(
                "contracts.id", name="fk_prewedding_events_contract_id_contracts"
            ),
            nullable=False,
        ),
        sa.Column("event_date", sa.Date, nullable=False),
        sa.Column("venue_name", sa.String(200), nullable=False),
        sa.Column("venue_address", sa.String(300), nullable=True),
        sa.Column("start_time", sa.Time, nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("contract_id", name="uq_prewedding_events_contract_id"),
    )


def downgrade() -> None:
    op.drop_table("prewedding_events")
```

- [ ] **Step 5: Run the database tests**

Run: `cd backend && uv run pytest tests/db -q`
Expected: PASS, including `test_models_match_migrations`.

- [ ] **Step 6: Write the failing service tests**

Add to `backend/tests/conftest.py` (import `PreweddingService` from `gerenciador.services.prewedding_service`; place the fixture after `contracts`):

```python
@pytest.fixture
def preweddings(session: Session, audit: AuditService) -> PreweddingService:
    return PreweddingService(session, audit)
```

Create `backend/tests/services/test_prewedding_service.py`:

```python
import datetime as dt
from collections.abc import Callable

import pytest
from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import AuditEvent, Contract, PreweddingEvent, Service
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
)
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    PreconditionRequiredError,
    StaleVersionError,
)
from gerenciador.services.prewedding_service import PreweddingInput, PreweddingService

MakeInput = Callable[..., ContractInput]
MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"
PARK = PreweddingInput(dt.date(2027, 1, 20), "Parque Barigui", None, dt.time(16, 0))


@pytest.fixture
def contract_id(
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> str:
    items = [
        ItemInput(catalog["ceremony"], 120000),
        ItemInput(catalog["prewedding"], 80000),
    ]
    return contracts.create(ctx, make_input(items=items)).id


def _events(session: Session) -> list[tuple[str, dict[str, object]]]:
    rows = session.scalars(
        select(AuditEvent)
        .where(AuditEvent.entity_type == "prewedding")
        .order_by(AuditEvent.id)
    )
    return [(row.action, row.details) for row in rows]


def test_schedule_creates_version_1_and_audits_without_values(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    view, created = preweddings.schedule(ctx, contract_id, None, PARK)

    assert created is True
    assert (view.contract_id, view.event_date, view.venue_name) == (
        contract_id,
        dt.date(2027, 1, 20),
        "Parque Barigui",
    )
    assert (view.venue_address, view.start_time, view.version) == (
        None,
        dt.time(16, 0),
        1,
    )
    assert preweddings.get(contract_id) == view
    assert _events(session) == [
        ("prewedding.scheduled", {"version": 1, "contract_id": contract_id})
    ]


def test_changing_needs_the_current_version(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    moved = PreweddingInput(
        dt.date(2027, 1, 20), "Jardim Botânico", "Rua A, 1", dt.time(16, 0)
    )

    with pytest.raises(PreconditionRequiredError):
        preweddings.schedule(ctx, contract_id, None, moved)
    with pytest.raises(StaleVersionError) as stale:
        preweddings.schedule(ctx, contract_id, 9, moved)
    assert stale.value.entity == "prewedding"

    view, created = preweddings.schedule(ctx, contract_id, 1, moved)
    assert (created, view.version, view.venue_name) == (False, 2, "Jardim Botânico")
    assert _events(session)[-1] == (
        "prewedding.updated",
        {"fields": ["venue_name", "venue_address"], "version": 2},
    )


def test_saving_the_same_values_changes_nothing(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    view, created = preweddings.schedule(ctx, contract_id, 1, PARK)
    assert (created, view.version) == (False, 1)
    assert [action for action, _ in _events(session)] == ["prewedding.scheduled"]


def test_a_contract_without_a_prewedding_item_is_refused(
    preweddings: PreweddingService,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    plain = contracts.create(ctx, make_input())
    with pytest.raises(ConflictError) as error:
        preweddings.schedule(ctx, plain.id, None, PARK)
    assert error.value.message == "este contrato não inclui pré-wedding"


def test_missing_or_deleted_contracts_are_not_found(
    preweddings: PreweddingService,
    contracts: ContractService,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    for call in (
        lambda: preweddings.get(MISSING),
        lambda: preweddings.schedule(ctx, MISSING, None, PARK),
        lambda: preweddings.cancel(ctx, MISSING, 1),
    ):
        with pytest.raises(NotFoundError) as missing:
            call()
        assert str(missing.value) == "contrato não encontrado"

    preweddings.schedule(ctx, contract_id, None, PARK)
    contracts.delete(ctx, contract_id)
    with pytest.raises(NotFoundError) as deleted:
        preweddings.get(contract_id)
    assert str(deleted.value) == "contrato não encontrado"
    with pytest.raises(NotFoundError):
        preweddings.schedule(ctx, contract_id, 1, PARK)


def test_reading_when_nothing_is_scheduled(
    preweddings: PreweddingService, contract_id: str
) -> None:
    with pytest.raises(NotFoundError) as error:
        preweddings.get(contract_id)
    assert str(error.value) == "pré-wedding não agendado"


def test_cancel_checks_the_version_and_allows_a_fresh_schedule(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    with pytest.raises(NotFoundError) as nothing:
        preweddings.cancel(ctx, contract_id, 1)
    assert str(nothing.value) == "pré-wedding não agendado"

    preweddings.schedule(ctx, contract_id, None, PARK)
    with pytest.raises(StaleVersionError):
        preweddings.cancel(ctx, contract_id, 2)
    preweddings.cancel(ctx, contract_id, 1)

    assert session.scalars(select(PreweddingEvent)).all() == []
    assert _events(session)[-1] == ("prewedding.cancelled", {"version": 1})
    view, created = preweddings.schedule(ctx, contract_id, None, PARK)
    assert (created, view.version) == (True, 1)


def test_unmarking_the_service_keeps_the_schedule_but_blocks_changes(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
    catalog: dict[str, str],
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    session.execute(
        update(Service)
        .where(Service.id == catalog["prewedding"])
        .values(is_prewedding=False)
    )
    session.commit()

    assert preweddings.get(contract_id).venue_name == "Parque Barigui"
    with pytest.raises(ConflictError):
        preweddings.schedule(ctx, contract_id, 1, PARK)
    preweddings.cancel(ctx, contract_id, 1)


def test_the_contract_version_never_moves(
    preweddings: PreweddingService,
    contracts: ContractService,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    moved = PreweddingInput(dt.date(2027, 2, 2), "Jardim Botânico", None, None)
    preweddings.schedule(ctx, contract_id, 1, moved)
    preweddings.cancel(ctx, contract_id, 2)
    assert contracts.get(contract_id).version == 1


def test_a_schedule_that_loses_the_insert_race_asks_for_a_version(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    # Load the contract with no pre-wedding, then insert one behind the ORM's back,
    # as a concurrent request would.
    contract = session.get(Contract, contract_id)
    assert contract is not None
    assert contract.prewedding is None
    now = utcnow()
    session.execute(
        insert(PreweddingEvent).values(
            id="other",
            contract_id=contract_id,
            event_date=dt.date(2027, 2, 1),
            venue_name="Outro",
            version=1,
            created_at=now,
            updated_at=now,
        )
    )
    with pytest.raises(PreconditionRequiredError):
        preweddings.schedule(ctx, contract_id, None, PARK)
```

- [ ] **Step 7: Run them to see them fail**

Run: `cd backend && uv run pytest tests/services/test_prewedding_service.py -q`
Expected: FAIL with `ModuleNotFoundError: gerenciador.services.prewedding_service`.

- [ ] **Step 8: Write the service**

Create `backend/src/gerenciador/services/prewedding_service.py`:

```python
"""Pre-wedding shoots: an optional second event on a contract, scheduled apart from it."""

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import Contract, ContractItem, PreweddingEvent
from gerenciador.repositories.contract_repository import ContractRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    PreconditionRequiredError,
    StaleVersionError,
)

ENTITY = "prewedding"
_FIELDS = ("event_date", "venue_name", "venue_address", "start_time")


@dataclass(frozen=True)
class PreweddingInput:
    event_date: dt.date
    venue_name: str
    venue_address: str | None
    start_time: dt.time | None


@dataclass(frozen=True)
class PreweddingView:
    id: str
    contract_id: str
    event_date: dt.date
    venue_name: str
    venue_address: str | None
    start_time: dt.time | None
    version: int


def includes_prewedding(items: Iterable[ContractItem]) -> bool:
    """True when any item's service is currently marked as a pre-wedding shoot."""
    return any(item.service.is_prewedding for item in items)


def prewedding_view(row: PreweddingEvent) -> PreweddingView:
    return PreweddingView(
        id=row.id,
        contract_id=row.contract_id,
        event_date=row.event_date,
        venue_name=row.venue_name,
        venue_address=row.venue_address,
        start_time=row.start_time,
        version=row.version,
    )


def new_prewedding(data: PreweddingInput) -> PreweddingEvent:
    """A row to attach with `contract.prewedding = ...`, which sets its contract_id."""
    now = utcnow()
    return PreweddingEvent(
        id=str(uuid4()),
        version=1,
        created_at=now,
        updated_at=now,
        **{field: getattr(data, field) for field in _FIELDS},
    )


def record_scheduled(
    audit: AuditService, ctx: RequestContext, row: PreweddingEvent
) -> None:
    """Call after a flush, so the row knows its contract."""
    audit.record(
        ctx,
        "prewedding.scheduled",
        entity_type=ENTITY,
        entity_id=row.id,
        details={"version": 1, "contract_id": row.contract_id},
    )


def record_cancelled(
    audit: AuditService,
    ctx: RequestContext,
    row: PreweddingEvent,
    *,
    via: str | None = None,
) -> None:
    details: dict[str, object] = {"version": row.version}
    if via is not None:
        details["via"] = via
    audit.record(
        ctx,
        "prewedding.cancelled",
        entity_type=ENTITY,
        entity_id=row.id,
        details=details,
    )


class PreweddingService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._contracts = ContractRepository(session)
        self._audit = audit

    def get(self, contract_id: str) -> PreweddingView:
        return prewedding_view(self._scheduled(self._active(contract_id)))

    def schedule(
        self,
        ctx: RequestContext,
        contract_id: str,
        expected_version: int | None,
        data: PreweddingInput,
    ) -> tuple[PreweddingView, bool]:
        """Create or change the pre-wedding; the flag says whether it was created.

        `expected_version` is ignored while nothing is scheduled and required after.
        Checks run in order: contract found, version, eligibility.
        """
        contract = self._active(contract_id)
        row = contract.prewedding
        if row is not None:
            if expected_version is None:
                raise PreconditionRequiredError
            if row.version != expected_version:
                raise StaleVersionError(ENTITY)
        if not includes_prewedding(contract.items):
            raise ConflictError("este contrato não inclui pré-wedding")
        if row is None:
            return self._create(ctx, contract, data), True
        return self._change(ctx, row, data), False

    def cancel(
        self, ctx: RequestContext, contract_id: str, expected_version: int
    ) -> None:
        contract = self._active(contract_id)
        row = self._scheduled(contract)
        if row.version != expected_version:
            raise StaleVersionError(ENTITY)
        record_cancelled(self._audit, ctx, row)
        contract.prewedding = None
        self._session.commit()

    def _create(
        self, ctx: RequestContext, contract: Contract, data: PreweddingInput
    ) -> PreweddingView:
        row = new_prewedding(data)
        contract.prewedding = row
        try:
            self._session.flush()
        except IntegrityError as exc:
            # Another request scheduled one after this contract was read.
            self._session.rollback()
            raise PreconditionRequiredError from exc
        record_scheduled(self._audit, ctx, row)
        self._session.commit()
        return prewedding_view(row)

    def _change(
        self, ctx: RequestContext, row: PreweddingEvent, data: PreweddingInput
    ) -> PreweddingView:
        changed = [
            field for field in _FIELDS if getattr(row, field) != getattr(data, field)
        ]
        if changed:
            for field in changed:
                setattr(row, field, getattr(data, field))
            row.version += 1
            row.updated_at = utcnow()
            self._audit.record(
                ctx,
                "prewedding.updated",
                entity_type=ENTITY,
                entity_id=row.id,
                details={"fields": changed, "version": row.version},
            )
        self._session.commit()
        return prewedding_view(row)

    def _active(self, contract_id: str) -> Contract:
        contract = self._contracts.get(contract_id)
        if contract is None or contract.deleted_at is not None:
            raise NotFoundError("contract", contract_id, "contrato não encontrado")
        return contract

    @staticmethod
    def _scheduled(contract: Contract) -> PreweddingEvent:
        if contract.prewedding is None:
            raise NotFoundError(ENTITY, contract.id, "pré-wedding não agendado")
        return contract.prewedding
```

- [ ] **Step 9: Run the tests**

Run: `cd backend && uv run pytest tests/services/test_prewedding_service.py tests/db -q`
Expected: PASS.

- [ ] **Step 10: Run the backend checks and commit**

Run: `make check-backend`
Expected: exit 0.

```bash
git add backend/src/gerenciador/services/exceptions.py backend/src/gerenciador/db/models.py \
  backend/migrations/versions/0003_prewedding_events.py \
  backend/src/gerenciador/services/prewedding_service.py backend/tests/conftest.py \
  backend/tests/db/test_database.py backend/tests/db/test_migration_0003.py \
  backend/tests/services/test_prewedding_service.py
git commit -m "feat: store a pre-wedding per contract and schedule, change or cancel it"
```

---

### Task 2: Contracts create, cancel and report their pre-wedding

**Files:**
- Modify: `backend/src/gerenciador/services/contract_service.py`
- Modify: `backend/tests/services/test_contract_service.py` (append)
- Modify: `backend/tests/services/test_contract_renderer.py` (append)

**Interfaces:**
- Consumes (Task 1): `PreweddingInput`, `PreweddingView`, `includes_prewedding`, `prewedding_view`, `new_prewedding`, `record_scheduled`, `record_cancelled`, `ConflictError(message, code)`, fixture `preweddings`.
- Produces:
  - `ContractInput.prewedding: PreweddingInput | None = None` (last field, defaulted).
  - `ContractView.has_prewedding: bool` and `ContractView.prewedding: PreweddingView | None` (both `False`/`None` for a soft-deleted contract).
  - `ContractService.update(ctx, contract_id, expected_version, data, *, cancel_prewedding: bool = False)` and `ContractService.patch(ctx, contract_id, expected_version, apply, *, cancel_prewedding: bool = False)`.
  - Create with `prewedding` but no pre-wedding item → `ContractRuleError("prewedding", "inclua um serviço de pré-wedding")`.
  - An edit that removes the last pre-wedding item while one is scheduled → `ConflictError(PREWEDDING_SCHEDULED, code="prewedding_scheduled")` unless `cancel_prewedding=True`.

- [ ] **Step 1: Write the failing contract tests**

Append to `backend/tests/services/test_contract_service.py` (add `from gerenciador.services.prewedding_service import PreweddingInput, PreweddingService` to the imports):

```python
PARK = PreweddingInput(dt.date(2027, 1, 20), "Parque Barigui", None, dt.time(16, 0))


def _with_prewedding(
    make_input: MakeInput, catalog: dict[str, str], **overrides: object
) -> ContractInput:
    items = [
        ItemInput(catalog["ceremony"], 120000),
        ItemInput(catalog["prewedding"], 80000),
    ]
    return make_input(items=items, prewedding=PARK, **overrides)


def _contract_actions(session: Session) -> list[str]:
    return [a for a in _actions(session) if a.startswith(("contract.", "prewedding."))]


def test_create_with_a_prewedding_schedules_it(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    view = contracts.create(ctx, _with_prewedding(make_input, catalog))

    assert view.has_prewedding is True
    assert view.prewedding is not None
    assert (view.prewedding.venue_name, view.prewedding.version) == (
        "Parque Barigui",
        1,
    )
    assert _contract_actions(session) == ["contract.created", "prewedding.scheduled"]
    assert _last_event(session).details == {"version": 1, "contract_id": view.id}


def test_create_with_a_prewedding_needs_a_prewedding_item(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    with pytest.raises(ContractRuleError) as error:
        contracts.create(ctx, make_input(prewedding=PARK))
    assert (error.value.field, error.value.message) == (
        "prewedding",
        "inclua um serviço de pré-wedding",
    )
    assert session.scalars(select(Contract)).all() == []


def test_a_contract_without_a_prewedding_reports_none(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    view = contracts.create(ctx, make_input())
    assert (view.has_prewedding, view.prewedding) == (False, None)


def test_removing_the_last_prewedding_item_needs_confirmation(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    created = contracts.create(ctx, _with_prewedding(make_input, catalog))
    without = make_input(items=[ItemInput(catalog["ceremony"], 120000)])

    with pytest.raises(ConflictError) as error:
        contracts.update(ctx, created.id, 1, without)
    assert error.value.code == "prewedding_scheduled"
    unchanged = contracts.get(created.id)
    assert (unchanged.version, unchanged.prewedding is not None) == (1, True)

    updated = contracts.update(ctx, created.id, 1, without, cancel_prewedding=True)
    assert (updated.version, updated.has_prewedding, updated.prewedding) == (
        2,
        False,
        None,
    )
    assert _contract_actions(session)[-2:] == [
        "contract.updated",
        "prewedding.cancelled",
    ]
    assert _last_event(session).details == {"version": 1, "via": "contract_update"}


def test_the_cancel_flag_is_ignored_while_a_prewedding_item_remains(
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    created = contracts.create(ctx, _with_prewedding(make_input, catalog))
    kept = make_input(
        items=[ItemInput(catalog["prewedding"], 80000)], pix_discount_cents=None
    )
    updated = contracts.update(ctx, created.id, 1, kept, cancel_prewedding=True)
    assert updated.prewedding is not None


def test_swapping_prewedding_services_keeps_the_schedule(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    session.execute(
        update(Service)
        .where(Service.id == catalog["second"])
        .values(is_prewedding=True)
    )
    session.commit()
    created = contracts.create(ctx, _with_prewedding(make_input, catalog))
    swapped = make_input(
        items=[
            ItemInput(catalog["ceremony"], 120000),
            ItemInput(catalog["second"], 50000),
        ]
    )
    updated = contracts.update(ctx, created.id, 1, swapped)
    assert updated.prewedding is not None


def test_edits_after_unmarking_the_service_keep_the_schedule(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    created = contracts.create(ctx, _with_prewedding(make_input, catalog))
    session.execute(
        update(Service)
        .where(Service.id == catalog["prewedding"])
        .values(is_prewedding=False)
    )
    session.commit()

    renamed = contracts.update(
        ctx, created.id, 1, _with_prewedding(make_input, catalog, venue_name="Catedral")
    )
    assert (renamed.version, renamed.has_prewedding) == (2, False)
    assert renamed.prewedding is not None

    dropped = contracts.update(
        ctx, created.id, 2, make_input(items=[ItemInput(catalog["ceremony"], 120000)])
    )
    assert dropped.prewedding is not None


def test_a_deleted_contract_reports_no_prewedding_until_restored(
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    created = contracts.create(ctx, _with_prewedding(make_input, catalog))
    contracts.delete(ctx, created.id)
    deleted = contracts.get(created.id)
    assert (deleted.has_prewedding, deleted.prewedding) == (False, None)

    restored = contracts.restore(ctx, created.id)
    assert restored.has_prewedding is True
    assert restored.prewedding is not None


def test_scheduling_later_shows_on_the_contract_without_a_new_version(
    contracts: ContractService,
    preweddings: PreweddingService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    items = [
        ItemInput(catalog["ceremony"], 120000),
        ItemInput(catalog["prewedding"], 80000),
    ]
    created = contracts.create(ctx, make_input(items=items))
    assert (created.has_prewedding, created.prewedding) == (True, None)

    preweddings.schedule(ctx, created.id, None, PARK)
    view = contracts.get(created.id)
    assert view.version == 1
    assert view.prewedding is not None
    assert view.prewedding.venue_name == "Parque Barigui"
```

Append to `backend/tests/services/test_contract_renderer.py` (import `PreweddingInput, PreweddingService` from `gerenciador.services.prewedding_service`):

```python
def test_the_pdf_ignores_the_prewedding(
    renderer: ContractRenderer,
    contracts: ContractService,
    preweddings: PreweddingService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> None:
    items = [
        ItemInput(catalog["ceremony"], 120000),
        ItemInput(catalog["prewedding"], 80000),
    ]
    created = contracts.create(ctx, make_input(items=items, pix_discount_cents=None))
    before = renderer.render_html(contracts.get(created.id))

    preweddings.schedule(
        ctx,
        created.id,
        None,
        PreweddingInput(
            dt.date(2027, 1, 20), "Parque Barigui", "Rua A, 1", dt.time(16, 0)
        ),
    )
    after = renderer.render_html(contracts.get(created.id))

    assert after == before
    assert "Parque Barigui" not in after
```

(If `test_contract_renderer.py` has no `catalog` parameter elsewhere, the fixture still comes from `tests/conftest.py`.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && uv run pytest tests/services/test_contract_service.py tests/services/test_contract_renderer.py -q`
Expected: FAIL (`ContractInput` has no `prewedding`, `ContractView` has no `has_prewedding`).

- [ ] **Step 3: Implement in `contract_service.py`**

Imports to add:

```python
from gerenciador.services.prewedding_service import (
    PreweddingInput,
    PreweddingView,
    includes_prewedding,
    new_prewedding,
    prewedding_view,
    record_cancelled,
    record_scheduled,
)
```

Below `_SCALAR_FIELDS` add:

```python
PREWEDDING_SCHEDULED = "o contrato tem um pré-wedding agendado; confirme o cancelamento para remover o item"
```

Dataclasses: add as the last field of `ContractInput`

```python
    prewedding: PreweddingInput | None = None
```

and as the last two fields of `ContractView`

```python
    has_prewedding: bool
    prewedding: PreweddingView | None
```

Add a module-level helper after `_item_error`:

```python
def _wants_prewedding(data: ContractInput, services: dict[str, Service]) -> bool:
    return any(services[item.service_id].is_prewedding for item in data.items)
```

`create` becomes:

```python
def create(self, ctx: RequestContext, data: ContractInput) -> ContractView:
    _check_rules(data)
    services = self._resolve_services(data, [])
    if data.prewedding is not None and not _wants_prewedding(data, services):
        raise ContractRuleError("prewedding", "inclua um serviço de pré-wedding")
    groom = self._upsert(ctx, data.groom, data.couple_address)
    bride = self._upsert(ctx, data.bride, data.couple_address)
    now = utcnow()
    contract = Contract(
        id=str(uuid4()),
        groom=groom,
        bride=bride,
        items=self._sync_items([], data, services),
        prewedding=new_prewedding(data.prewedding)
        if data.prewedding is not None
        else None,
        version=1,
        created_at=now,
        updated_at=now,
        **{field: getattr(data, field) for field in _SCALAR_FIELDS},
    )
    self._repo.add(contract)
    self._audit.record(
        ctx,
        "contract.created",
        entity_type=_ENTITY,
        entity_id=contract.id,
        details={"version": 1},
    )
    if contract.prewedding is not None:
        record_scheduled(self._audit, ctx, contract.prewedding)
    self._session.commit()
    return self._to_view(contract)
```

`has_prewedding` becomes:

```python
    def has_prewedding(self, contract_id: str) -> bool:
        """True when any item's service is currently marked as a pre-wedding shoot."""
        return includes_prewedding(self._require(contract_id).items)
```

`update` and `patch` gain the keyword and pass it on:

```python
def update(
    self,
    ctx: RequestContext,
    contract_id: str,
    expected_version: int,
    data: ContractInput,
    *,
    cancel_prewedding: bool = False,
) -> ContractView:
    contract = self._editable(contract_id, expected_version)
    return self._apply_update(ctx, contract, data, cancel_prewedding)


def patch(
    self,
    ctx: RequestContext,
    contract_id: str,
    expected_version: int,
    apply: Callable[[ContractView], ContractInput],
    *,
    cancel_prewedding: bool = False,
) -> ContractView:
    """Edit a contract from a function of its current state.

    Checks run in order: not found, deleted, stale version. Only then is `apply` called;
    whatever it raises propagates and nothing is stored.
    """
    contract = self._editable(contract_id, expected_version)
    return self._apply_update(
        ctx, contract, apply(self._to_view(contract)), cancel_prewedding
    )
```

In `_apply_update`, change the signature to `(self, ctx, contract, data, cancel_prewedding: bool)` and right after `services = self._resolve_services(data, contract.items)` add:

```python
        # Only an edit that drops the last pre-wedding item cancels the schedule.
        scheduled = contract.prewedding
        removing = (
            scheduled is not None
            and includes_prewedding(contract.items)
            and not _wants_prewedding(data, services)
        )
        if removing and not cancel_prewedding:
            raise ConflictError(PREWEDDING_SCHEDULED, code="prewedding_scheduled")
```

and just before the final `self._session.commit()` of `_apply_update` add:

```python
        if removing and scheduled is not None:
            record_cancelled(self._audit, ctx, scheduled, via="contract_update")
            contract.prewedding = None
```

In `_to_view`, add before `return ContractView(`:

```python
        active = contract.deleted_at is None
```

and the two new keyword arguments at the end of the `ContractView(...)` call:

```python
has_prewedding = (active and includes_prewedding(contract.items),)
prewedding = (
    (
        prewedding_view(contract.prewedding)
        if active and contract.prewedding is not None
        else None
    ),
)
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && uv run pytest tests/services -q`
Expected: PASS (the existing `test_has_prewedding_reads_the_current_flag` too).

- [ ] **Step 5: Run the backend checks and commit**

Run: `make check-backend`
Expected: exit 0.

```bash
git add backend/src/gerenciador/services/contract_service.py \
  backend/tests/services/test_contract_service.py backend/tests/services/test_contract_renderer.py
git commit -m "feat: create a contract with its pre-wedding and cancel it when its item is removed"
```

---

### Task 3: Pre-wedding API and contract API changes

**Files:**
- Modify: `backend/src/gerenciador/api/v1/versioning.py`
- Modify: `backend/src/gerenciador/api/errors.py`
- Modify: `backend/src/gerenciador/api/v1/schemas.py`
- Modify: `backend/src/gerenciador/api/v1/contracts.py:49-65`
- Create: `backend/src/gerenciador/api/v1/prewedding.py`
- Modify: `backend/src/gerenciador/api/deps.py`
- Modify: `backend/src/gerenciador/api/v1/__init__.py`
- Create: `backend/tests/api/test_prewedding_api.py`
- Modify: `frontend/src/api/schema.d.ts` (regenerated)
- Modify: `frontend/src/test/fixtures.ts` (`makeContract`)

**Interfaces:**
- Consumes (Tasks 1-2): `PreweddingService`, `PreweddingInput`, `PreweddingView`, `PreconditionRequiredError`, `ConflictError.code`, `ContractService.patch(..., cancel_prewedding=)`, `ContractView.has_prewedding/prewedding`.
- Produces:
  - `optional_version(if_match: str | None) -> int | None` in `versioning.py`.
  - `problem_response(..., code: str | None = None)` adds `"code"` to the body; 409s carry `ConflictError.code`; `PreconditionRequiredError` → 428 `"If-Match header is required"`.
  - Schemas `PreweddingIn{date, venue_name, venue_address?, start_time?}`, `PreweddingOut{date, venue_name, venue_address, start_time, version}`, `ContractCreate.prewedding: PreweddingIn | None`, `ContractPatch.cancel_prewedding: bool` (strict, default false), `ContractOut.has_prewedding: bool`, `ContractOut.prewedding: PreweddingOut | None`.
  - Routes `GET|PUT|DELETE /api/v1/contracts/{contract_id}/prewedding`.
  - Frontend types `components["schemas"]["PreweddingIn" | "PreweddingOut"]`; `makeContract()` includes `has_prewedding: false, prewedding: null`.

- [ ] **Step 1: Write the failing API tests**

Create `backend/tests/api/test_prewedding_api.py`:

```python
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

URL = "/api/v1/contracts"
PROBLEM = "application/problem+json"
BODY = {"date": "2027-01-20", "venue_name": "Parque Barigui", "start_time": "16:00"}
Payload = Callable[..., dict[str, Any]]


def _contract(
    api: TestClient,
    payload: Payload,
    catalog: dict[str, str],
    *,
    prewedding_item: bool = True,
    **overrides: Any,
) -> dict[str, Any]:
    items = [{"service_id": catalog["ceremony"], "amount_cents": 120000}]
    if prewedding_item:
        items.append({"service_id": catalog["prewedding"], "amount_cents": 80000})
    response = api.post(URL, json=payload(payment={"items": items}, **overrides))
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _url(contract: dict[str, Any]) -> str:
    return f"{URL}/{contract['id']}/prewedding"


def test_schedule_change_and_cancel(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    url = _url(contract)

    created = api.put(url, json=BODY)
    assert created.status_code == 201
    assert created.headers["ETag"] == '"1"'
    assert created.json() == {
        "date": "2027-01-20",
        "venue_name": "Parque Barigui",
        "venue_address": None,
        "start_time": "16:00:00",
        "version": 1,
    }
    read = api.get(url)
    assert (read.status_code, read.headers["ETag"], read.json()) == (
        200,
        '"1"',
        created.json(),
    )

    missing = api.put(url, json=BODY)
    assert missing.status_code == 428
    assert missing.headers["content-type"] == PROBLEM
    stale = api.put(url, json=BODY, headers={"If-Match": '"9"'})
    assert stale.status_code == 412
    assert stale.json()["detail"] == "The prewedding changed since it was loaded"

    changed = api.put(
        url, json={**BODY, "venue_name": "Jardim"}, headers={"If-Match": '"1"'}
    )
    assert (changed.status_code, changed.headers["ETag"]) == (200, '"2"')
    assert changed.json()["venue_name"] == "Jardim"

    assert api.delete(url).status_code == 428
    assert api.delete(url, headers={"If-Match": '"1"'}).status_code == 412
    assert api.delete(url, headers={"If-Match": '"2"'}).status_code == 204
    gone = api.get(url)
    assert (gone.status_code, gone.json()["detail"]) == (
        404,
        "pré-wedding não agendado",
    )

    assert api.get(f"{URL}/{contract['id']}").json()["version"] == 1


def test_the_first_schedule_ignores_if_match(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    response = api.put(_url(contract), json=BODY, headers={"If-Match": "garbage"})
    assert response.status_code == 201


def test_ineligible_missing_and_deleted_contracts(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    plain = _contract(api, payload, catalog, prewedding_item=False)
    refused = api.put(_url(plain), json=BODY)
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "este contrato não inclui pré-wedding",
    )

    missing = f"{URL}/{uuid4()}/prewedding"
    for response in (
        api.get(missing),
        api.put(missing, json=BODY),
        api.delete(missing, headers={"If-Match": '"1"'}),
    ):
        assert (response.status_code, response.json()["detail"]) == (
            404,
            "contrato não encontrado",
        )

    deleted = _contract(api, payload, catalog)
    assert api.delete(f"{URL}/{deleted['id']}").status_code == 204
    assert api.put(_url(deleted), json=BODY).status_code == 404
    assert api.get(f"{URL}/not-a-uuid/prewedding").status_code == 422


def test_validation(api: TestClient, payload: Payload, catalog: dict[str, str]) -> None:
    url = _url(_contract(api, payload, catalog))
    no_place = api.put(url, json={"date": "2027-01-20"})
    assert no_place.status_code == 422
    assert [e["field"] for e in no_place.json()["errors"]] == ["venue_name"]
    assert api.put(url, json={**BODY, "notes": "x"}).status_code == 422

    blanks = api.put(url, json={**BODY, "venue_address": " ", "start_time": ""})
    assert blanks.status_code == 201
    assert (blanks.json()["venue_address"], blanks.json()["start_time"]) == (None, None)


def test_create_a_contract_with_its_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, prewedding=BODY)
    assert contract["has_prewedding"] is True
    assert contract["prewedding"]["venue_name"] == "Parque Barigui"
    assert contract["prewedding"]["version"] == 1

    refused = api.post(URL, json=payload(prewedding=BODY))
    assert refused.status_code == 422
    assert refused.json()["errors"] == [
        {"field": "prewedding", "message": "inclua um serviço de pré-wedding"}
    ]


def test_removing_the_item_needs_cancel_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, prewedding=BODY)
    url = f"{URL}/{contract['id']}"
    only_ceremony = {
        "payment": {
            "items": [{"service_id": catalog["ceremony"], "amount_cents": 120000}]
        }
    }

    refused = api.patch(url, json=only_ceremony, headers={"If-Match": '"1"'})
    assert refused.status_code == 409
    assert refused.json()["code"] == "prewedding_scheduled"

    saved = api.patch(
        url,
        json={**only_ceremony, "cancel_prewedding": True},
        headers={"If-Match": '"1"'},
    )
    assert saved.status_code == 200
    body = saved.json()
    assert (body["version"], body["has_prewedding"], body["prewedding"]) == (
        2,
        False,
        None,
    )
    assert api.get(f"{url}/prewedding").status_code == 404


def test_cancel_prewedding_must_be_a_boolean(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    response = api.patch(
        f"{URL}/{contract['id']}",
        json={"cancel_prewedding": "yes"},
        headers={"If-Match": '"1"'},
    )
    assert response.status_code == 422


def test_list_rows_carry_the_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, prewedding=BODY)
    row = api.get(URL).json()["items"][0]
    assert row["has_prewedding"] is True
    assert row["prewedding"]["venue_name"] == "Parque Barigui"

    assert api.delete(f"{URL}/{contract['id']}").status_code == 204
    deleted = api.get(URL, params={"include_deleted": True}).json()["items"][0]
    assert (deleted["has_prewedding"], deleted["prewedding"]) == (False, None)
```

The same couple can sign several contracts (their clients are reused), so every test uses the `payload` fixture's people.

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && uv run pytest tests/api/test_prewedding_api.py -q`
Expected: FAIL (404 on the new routes, unknown `prewedding` field).

- [ ] **Step 3: Versioning and errors**

Append to `backend/src/gerenciador/api/v1/versioning.py`:

```python
def optional_version(if_match: str | None) -> int | None:
    """For edits that may create: an absent header means nothing is expected.

    An unreadable validator becomes 0, which no version ever has.
    """
    if if_match is None:
        return None
    match = _STRONG_VERSION.fullmatch(if_match.strip())
    return int(match.group(1)) if match else 0
```

In `backend/src/gerenciador/api/errors.py`:
- import `PreconditionRequiredError` with the other exceptions;
- give `problem_response` a `code: str | None = None` keyword parameter (after `headers`) and, after the `errors` block, add `if code is not None: body["code"] = code`;
- replace `_conflict` and add `_precondition_required`:

```python
def _conflict(request: Request, exc: Exception) -> Response:
    error = cast(ConflictError, exc)
    return problem_response(409, error.message, _request_id(request), code=error.code)


def _precondition_required(request: Request, exc: Exception) -> Response:
    return problem_response(428, "If-Match header is required", _request_id(request))
```

- register it in `register_error_handlers`, after the `StaleVersionError` line:

```python
    app.add_exception_handler(PreconditionRequiredError, _precondition_required)
```

- [ ] **Step 4: Schemas**

In `backend/src/gerenciador/api/v1/schemas.py`, import `PreweddingInput, PreweddingView` from `gerenciador.services.prewedding_service`. Add after `SigningIn`:

```python
class PreweddingIn(StrictModel):
    date: dt.date
    venue_name: Name
    venue_address: OptionalAddress = None
    start_time: OptionalTime = None

    def to_input(self) -> PreweddingInput:
        return PreweddingInput(
            self.date, self.venue_name, self.venue_address, self.start_time
        )
```

`ContractCreate` gains a field after `signing`:

```python
    prewedding: PreweddingIn | None = None
```

and its `to_input` passes, as the last argument:

```python
prewedding = (self.prewedding.to_input() if self.prewedding is not None else None,)
```

`ContractPatch` gains a field after `signing`:

```python
    cancel_prewedding: Flag = False
```

and `apply_to` excludes it from the merge:

```python
        merged = _merge(
            _as_request(view),
            self.model_dump(exclude_unset=True, exclude={"cancel_prewedding"}),
        )
```

Responses: add before `ContractOut`:

```python
class PreweddingOut(BaseModel):
    date: dt.date
    venue_name: str
    venue_address: str | None
    start_time: dt.time | None
    version: int

    @classmethod
    def from_view(cls, view: PreweddingView) -> Self:
        return cls(
            date=view.event_date,
            venue_name=view.venue_name,
            venue_address=view.venue_address,
            start_time=view.start_time,
            version=view.version,
        )
```

`ContractOut` gains, after `signing: SigningOut`:

```python
    has_prewedding: bool
    prewedding: PreweddingOut | None
```

and `from_view` passes, after `signing=...`:

```python
has_prewedding = (view.has_prewedding,)
prewedding = (
    (PreweddingOut.from_view(view.prewedding) if view.prewedding is not None else None),
)
```

- [ ] **Step 5: Router, dependency, wiring**

In `backend/src/gerenciador/api/deps.py` import `PreweddingService` and add:

```python
def get_prewedding_service(session: DbSession) -> PreweddingService:
    return PreweddingService(session, AuditService(session))
```

```python
Preweddings = Annotated[PreweddingService, Depends(get_prewedding_service)]
```

Create `backend/src/gerenciador/api/v1/prewedding.py`:

```python
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response

from gerenciador.api.deps import Ctx, Preweddings
from gerenciador.api.v1.schemas import PreweddingIn, PreweddingOut
from gerenciador.api.v1.versioning import expected_version, optional_version
from gerenciador.services.prewedding_service import PreweddingView

router = APIRouter(prefix="/contracts/{contract_id}/prewedding", tags=["prewedding"])


def _respond(view: PreweddingView, response: Response) -> PreweddingOut:
    response.headers["ETag"] = f'"{view.version}"'
    return PreweddingOut.from_view(view)


@router.get("")
def get_prewedding(
    contract_id: UUID, response: Response, service: Preweddings
) -> PreweddingOut:
    return _respond(service.get(str(contract_id)), response)


@router.put("", responses={201: {"model": PreweddingOut, "description": "Scheduled"}})
def schedule_prewedding(
    contract_id: UUID,
    body: PreweddingIn,
    response: Response,
    ctx: Ctx,
    service: Preweddings,
    if_match: Annotated[str | None, Header()] = None,
) -> PreweddingOut:
    view, created = service.schedule(
        ctx, str(contract_id), optional_version(if_match), body.to_input()
    )
    if created:
        response.status_code = 201
    return _respond(view, response)


@router.delete("", status_code=204)
def cancel_prewedding(
    contract_id: UUID,
    ctx: Ctx,
    service: Preweddings,
    if_match: Annotated[str | None, Header()] = None,
) -> None:
    service.cancel(ctx, str(contract_id), expected_version(if_match, "prewedding"))
```

In `backend/src/gerenciador/api/v1/__init__.py` import `prewedding` and add `api_router.include_router(prewedding.router)` after the contracts router.

In `backend/src/gerenciador/api/v1/contracts.py`, `update_contract` passes the flag:

```python
        view = service.patch(
            ctx,
            str(contract_id),
            version,
            lambda view: body.apply_to(view).to_input(),
            cancel_prewedding=body.cancel_prewedding,
        )
```

- [ ] **Step 6: Run the backend tests**

Run: `cd backend && uv run pytest -q`
Expected: PASS. If an existing test compares a whole contract body (e.g. in `tests/api/test_contracts_api.py`), add `"has_prewedding": False, "prewedding": None` to its expected dict.

- [ ] **Step 7: Regenerate the frontend types and fix the fixture**

Run: `make api-types`

In `frontend/src/test/fixtures.ts`, `makeContract` adds, after `signing`:

```ts
    has_prewedding: false,
    prewedding: null,
```

- [ ] **Step 8: Run all checks and commit**

Run: `make check`
Expected: exit 0.

```bash
git add backend/src/gerenciador/api backend/tests/api/test_prewedding_api.py \
  frontend/src/api/schema.d.ts frontend/src/test/fixtures.ts
git commit -m "feat: add the pre-wedding API and report it on contracts"
```

(Also `git add` any existing backend test you adjusted in Step 6.)

---

### Task 4: Pré-wedding dialog on the contracts list

**Files:**
- Modify: `frontend/src/domain/problems.ts`, `frontend/src/domain/problems.test.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/api/prewedding.ts`
- Create: `frontend/src/features/contracts/preweddingForm.ts`
- Create: `frontend/src/features/contracts/preweddingForm.test.ts`
- Create: `frontend/src/features/contracts/PreweddingDialog.tsx`
- Create: `frontend/src/features/contracts/PreweddingDialog.test.tsx`
- Modify: `frontend/src/features/contracts/ContractListPage.tsx`
- Modify: `frontend/src/features/contracts/messages.ts`

**Interfaces:**
- Consumes (Task 3): `Schemas["PreweddingIn"]`, `Schemas["PreweddingOut"]`, `ContractOut.has_prewedding/prewedding`, PUT/DELETE `/api/v1/contracts/{contract_id}/prewedding`, 409 body `code`.
- Produces:
  - `Problem.code: string | null`; `ApiError.code: string | null`.
  - `export type PreweddingIn`, `PreweddingOut` from `src/api/client.ts`.
  - Hooks `useSchedulePrewedding()` (variables `{ contractId: string; version: number | null; body: PreweddingIn }`) and `useCancelPrewedding()` (variables `{ contractId: string; version: number }`).
  - From `preweddingForm.ts`: `PreweddingValues`, `PreweddingErrors`, `emptyPrewedding()`, `preweddingValues(p)`, `isBlankPrewedding(v)`, `validatePrewedding(v)`, `toPreweddingRequest(v)`, `preweddingSummary(p)`, `preweddingButtonLabel(p)`.
  - `<PreweddingDialog contract={ContractOut} onClose={() => void} />`.

- [ ] **Step 1: `code` on problems**

`frontend/src/domain/problems.ts`: add `code: string | null;` to `Problem` and `code: typeof record.code === "string" ? record.code : null,` to the object `parseProblem` returns. In `problems.test.ts`, add `code: null` to every whole-object expectation of `parseProblem` (the `toEqual` at line 12), and add:

```ts
test("keeps a problem's code", () => {
  expect(parseProblem(409, { code: "prewedding_scheduled" }).code).toBe("prewedding_scheduled");
});
```

`frontend/src/api/client.ts`: export the types

```ts
export type PreweddingIn = Schemas["PreweddingIn"];
export type PreweddingOut = Schemas["PreweddingOut"];
```

and add `readonly code: string | null;` to `ApiError`, set with `this.code = problem.code;` in the constructor.

- [ ] **Step 2: Write the failing form-helper tests**

Create `frontend/src/features/contracts/preweddingForm.test.ts`:

```ts
import {
  emptyPrewedding,
  isBlankPrewedding,
  preweddingButtonLabel,
  preweddingSummary,
  preweddingValues,
  toPreweddingRequest,
  validatePrewedding,
} from "./preweddingForm";

const SCHEDULED = {
  date: "2027-01-20",
  venue_name: "Parque Barigui",
  venue_address: null,
  start_time: "16:00:00",
  version: 3,
};

test("date and place are required, address and time are not", () => {
  expect(validatePrewedding(emptyPrewedding())).toEqual({
    date: "campo obrigatório",
    venue_name: "campo obrigatório",
  });
  expect(validatePrewedding({ ...emptyPrewedding(), date: "2027-01-20", venue_name: "X" })).toEqual(
    {},
  );
});

test("blank means every field is empty", () => {
  expect(isBlankPrewedding({ ...emptyPrewedding(), venue_address: "  " })).toBe(true);
  expect(isBlankPrewedding({ ...emptyPrewedding(), start_time: "10:00" })).toBe(false);
});

test("converts to and from the API", () => {
  expect(preweddingValues(SCHEDULED)).toEqual({
    date: "2027-01-20",
    venue_name: "Parque Barigui",
    venue_address: "",
    start_time: "16:00",
  });
  expect(
    toPreweddingRequest({
      date: "2027-01-20",
      venue_name: " Parque ",
      venue_address: " ",
      start_time: "",
    }),
  ).toEqual({ date: "2027-01-20", venue_name: "Parque", venue_address: null, start_time: null });
});

test("summary and button label", () => {
  expect(preweddingSummary(SCHEDULED)).toBe("20/01/2027 às 16:00 · Parque Barigui");
  expect(preweddingSummary({ ...SCHEDULED, start_time: null })).toBe("20/01/2027 · Parque Barigui");
  expect(preweddingButtonLabel(SCHEDULED)).toBe("Pré-wedding 20/01");
  expect(preweddingButtonLabel(null)).toBe("Agendar pré-wedding");
});
```

Run: `cd frontend && npx vitest run src/features/contracts/preweddingForm.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the form helpers**

Create `frontend/src/features/contracts/preweddingForm.ts`:

```ts
import type { PreweddingIn, PreweddingOut } from "../../api/client";
import { formatIsoDate } from "../../domain/dates";
import { REQUIRED, textError } from "../../domain/fieldRules";

export type PreweddingValues = {
  date: string;
  venue_name: string;
  venue_address: string;
  start_time: string;
};
export type PreweddingErrors = Partial<Record<keyof PreweddingValues, string>>;

export function emptyPrewedding(): PreweddingValues {
  return { date: "", venue_name: "", venue_address: "", start_time: "" };
}

export function preweddingValues(prewedding: PreweddingOut): PreweddingValues {
  return {
    date: prewedding.date,
    venue_name: prewedding.venue_name,
    venue_address: prewedding.venue_address ?? "",
    start_time: prewedding.start_time ? prewedding.start_time.slice(0, 5) : "",
  };
}

export function isBlankPrewedding(values: PreweddingValues): boolean {
  return Object.values(values).every((value) => value.trim() === "");
}

export function validatePrewedding(values: PreweddingValues): PreweddingErrors {
  const errors: PreweddingErrors = {};
  if (values.date === "") errors.date = REQUIRED;
  const venue = textError(values.venue_name, 200, true);
  if (venue) errors.venue_name = venue;
  const address = textError(values.venue_address, 300, false);
  if (address) errors.venue_address = address;
  return errors;
}

const optional = (value: string) => (value.trim() === "" ? null : value.trim());

export function toPreweddingRequest(values: PreweddingValues): PreweddingIn {
  return {
    date: values.date,
    venue_name: values.venue_name.trim(),
    venue_address: optional(values.venue_address),
    start_time: optional(values.start_time),
  };
}

export function preweddingSummary(prewedding: PreweddingOut): string {
  const time = prewedding.start_time ? ` às ${prewedding.start_time.slice(0, 5)}` : "";
  return `${formatIsoDate(prewedding.date)}${time} · ${prewedding.venue_name}`;
}

export function preweddingButtonLabel(prewedding: PreweddingOut | null): string {
  return prewedding
    ? `Pré-wedding ${formatIsoDate(prewedding.date).slice(0, 5)}`
    : "Agendar pré-wedding";
}
```

Run the test again. Expected: PASS.

- [ ] **Step 4: Write the hooks**

Create `frontend/src/api/prewedding.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type PreweddingIn, api, unwrap } from "./client";
import { contractKeys } from "./keys";

const path = (contractId: string) => ({ path: { contract_id: contractId } });

// The list and the contract page both show the pre-wedding.
function useRefresh() {
  const client = useQueryClient();
  return (contractId: string) =>
    Promise.all([
      client.invalidateQueries({ queryKey: contractKeys.all }),
      client.invalidateQueries({ queryKey: contractKeys.one(contractId) }),
    ]);
}

type Schedule = { contractId: string; version: number | null; body: PreweddingIn };
type Cancel = { contractId: string; version: number };

export function useSchedulePrewedding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ contractId, version, body }: Schedule) =>
      unwrap(
        api.PUT("/api/v1/contracts/{contract_id}/prewedding", {
          params: {
            ...path(contractId),
            header: version === null ? {} : { "if-match": `"${version}"` },
          },
          body,
        }),
      ),
    onSuccess: (_data, { contractId }) => refresh(contractId),
    // A 412, 428 or 404 means the cached contract is stale; a retry must not resend it.
    onError: (_error, { contractId }) => refresh(contractId),
  });
}

export function useCancelPrewedding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ contractId, version }: Cancel) =>
      unwrap(
        api.DELETE("/api/v1/contracts/{contract_id}/prewedding", {
          params: { ...path(contractId), header: { "if-match": `"${version}"` } },
        }),
      ),
    onSuccess: (_data, { contractId }) => refresh(contractId),
    onError: (_error, { contractId }) => refresh(contractId),
  });
}
```

If the generated `header` type rejects `{}` for the PUT, pass `header: { "if-match": version === null ? undefined : \`"${version}"\` }` instead (openapi-fetch drops undefined headers).

- [ ] **Step 5: Write the failing dialog tests**

Add to `frontend/src/features/contracts/messages.ts`:

```ts
export const PREWEDDING_CHANGED =
  "O pré-wedding mudou desde que foi aberto. Os dados foram recarregados.";
export const PREWEDDING_ALREADY_CANCELLED =
  "Este pré-wedding já foi desmarcado. A lista foi atualizada.";
```

Create `frontend/src/features/contracts/PreweddingDialog.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ContractOut, PreweddingOut } from "../../api/client";
import { IDS, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const SCHEDULED: PreweddingOut = {
  date: "2027-01-20",
  venue_name: "Parque Barigui",
  venue_address: null,
  start_time: "16:00:00",
  version: 3,
};

function eligible(prewedding: PreweddingOut | null = null): ContractOut {
  return makeContract({ has_prewedding: true, prewedding });
}

function serveList(...responses: ContractOut[][]) {
  let call = 0;
  server.use(
    http.get("/api/v1/contracts", () => {
      const rows = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return HttpResponse.json(page(rows));
    }),
  );
}

function setInput(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

async function openDialog(name: string) {
  const { user } = renderApp("/contratos");
  await user.click(await screen.findByRole("button", { name }));
  return { user, dialog: screen.getByRole("dialog", { name: "Pré-wedding" }) };
}

test("the button shows only where a pre-wedding is possible or stored", async () => {
  serveList([
    makeContract({ id: "plain" }),
    makeContract({ id: "eligible", has_prewedding: true }),
    makeContract({ id: "scheduled", has_prewedding: true, prewedding: SCHEDULED }),
    // A service un-marked after scheduling: the schedule can still be cancelled.
    makeContract({ id: "orphan", has_prewedding: false, prewedding: SCHEDULED }),
  ]);
  renderApp("/contratos");
  const rows = await screen.findAllByRole("row");
  const labels = rows
    .slice(1)
    .map((row) => within(row).queryByRole("button", { name: /pré-wedding/i })?.textContent ?? null);
  expect(labels).toEqual([null, "Agendar pré-wedding", "Pré-wedding 20/01", "Pré-wedding 20/01"]);
});

test("schedules without If-Match", async () => {
  serveList([eligible()]);
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("If-Match") };
      return HttpResponse.json({ ...SCHEDULED, version: 1 }, { status: 201 });
    }),
  );
  const { user, dialog } = await openDialog("Agendar pré-wedding");
  setInput(within(dialog).getByLabelText("Data"), "2027-01-20");
  await user.type(within(dialog).getByLabelText("Local"), "Parque Barigui");
  setInput(within(dialog).getByLabelText("Horário"), "16:00");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

  expect(await screen.findByText("Pré-wedding agendado")).toBeInTheDocument();
  expect(sent).toEqual({
    body: {
      date: "2027-01-20",
      venue_name: "Parque Barigui",
      venue_address: null,
      start_time: "16:00",
    },
    ifMatch: null,
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a change is prefilled and sends If-Match", async () => {
  serveList([eligible(SCHEDULED)]);
  let ifMatch: string | null = null;
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return HttpResponse.json({ ...SCHEDULED, venue_name: "Jardim", version: 4 });
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  const place = within(dialog).getByLabelText("Local");
  expect(place).toHaveValue("Parque Barigui");
  expect(within(dialog).getByLabelText("Horário")).toHaveValue("16:00");
  await user.clear(place);
  await user.type(place, "Jardim");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Pré-wedding atualizado")).toBeInTheDocument();
  expect(ifMatch).toBe('"3"');
});

test("validates before sending", async () => {
  serveList([eligible()]);
  const { user, dialog } = await openDialog("Agendar pré-wedding");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getAllByText("campo obrigatório")).toHaveLength(2);
});

test("a stale version reloads the dialog and the retry sends the new version", async () => {
  const moved = { ...SCHEDULED, venue_name: "Jardim Botânico", version: 4 };
  serveList([eligible(SCHEDULED)], [eligible(moved)]);
  const sent: (string | null)[] = [];
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", ({ request }) => {
      sent.push(request.headers.get("If-Match"));
      return sent.length === 1
        ? problem(412, "The prewedding changed since it was loaded")
        : HttpResponse.json({ ...moved, version: 5 });
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

  expect(
    await within(dialog).findByText(
      "O pré-wedding mudou desde que foi aberto. Os dados foram recarregados.",
    ),
  ).toBeInTheDocument();
  await waitFor(() => expect(within(dialog).getByLabelText("Local")).toHaveValue("Jardim Botânico"));
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Pré-wedding atualizado")).toBeInTheDocument();
  expect(sent).toEqual(['"3"', '"4"']);
});

test("a refusal shows the server's message", async () => {
  serveList([eligible()]);
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", () =>
      problem(409, "este contrato não inclui pré-wedding"),
    ),
  );
  const { user, dialog } = await openDialog("Agendar pré-wedding");
  setInput(within(dialog).getByLabelText("Data"), "2027-01-20");
  await user.type(within(dialog).getByLabelText("Local"), "Parque");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(
    await within(dialog).findByText("este contrato não inclui pré-wedding"),
  ).toBeInTheDocument();
});

test("unschedules after a confirmation", async () => {
  serveList([eligible(SCHEDULED)]);
  let ifMatch: string | null = null;
  server.use(
    http.delete(`/api/v1/contracts/${IDS.contract}/prewedding`, ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Desmarcar pré-wedding" }));
  expect(within(dialog).getByText("Desmarcar o pré-wedding de 20/01/2027?")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
  await user.click(within(dialog).getByRole("button", { name: "Desmarcar pré-wedding" }));
  await user.click(within(dialog).getByRole("button", { name: "Desmarcar" }));
  expect(await screen.findByText("Pré-wedding desmarcado")).toBeInTheDocument();
  expect(ifMatch).toBe('"3"');
});

test("closing is blocked while a save is pending", async () => {
  serveList([eligible(SCHEDULED)]);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", async () => {
      await gate;
      return HttpResponse.json(SCHEDULED);
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Pré-wedding" })).toBeInTheDocument();
  release();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
```

Run: `cd frontend && npx vitest run src/features/contracts/PreweddingDialog.test.tsx`
Expected: FAIL (no button, no dialog).

- [ ] **Step 6: Write the dialog**

Create `frontend/src/features/contracts/PreweddingDialog.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import { ApiError, type ContractOut } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { useCancelPrewedding, useSchedulePrewedding } from "../../api/prewedding";
import { formatIsoDate } from "../../domain/dates";
import { Banner, Button, Dialog, DialogActions, Field, TextInput, useToast } from "../../ui";
import { NOT_FOUND_IN_LIST, PREWEDDING_ALREADY_CANCELLED, PREWEDDING_CHANGED } from "./messages";
import { coupleLabel } from "./names";
import {
  type PreweddingErrors,
  type PreweddingValues,
  emptyPrewedding,
  preweddingValues,
  toPreweddingRequest,
  validatePrewedding,
} from "./preweddingForm";

type Props = { contract: ContractOut; onClose: () => void };

const FIELDS: { key: keyof PreweddingValues; label: string; type: "date" | "time" | "text"; hint?: string }[] = [
  { key: "date", label: "Data", type: "date" },
  { key: "venue_name", label: "Local", type: "text" },
  { key: "venue_address", label: "Endereço", type: "text", hint: "Opcional" },
  { key: "start_time", label: "Horário", type: "time", hint: "Opcional" },
];

const valuesOf = (contract: ContractOut) =>
  contract.prewedding ? preweddingValues(contract.prewedding) : emptyPrewedding();

/** `contract` is the list's current row, so a retry after a reload uses the fresh version. */
export function PreweddingDialog({ contract, onClose }: Props) {
  const notify = useToast();
  const schedule = useSchedulePrewedding();
  const cancel = useCancelPrewedding();
  const [values, setValues] = useState(() => valuesOf(contract));
  const [errors, setErrors] = useState<PreweddingErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The version a 412 was answered for; undefined when no reload is awaited.
  const [staleVersion, setStaleVersion] = useState<number | null | undefined>(undefined);
  const busy = schedule.isPending || cancel.isPending;
  const current = contract.prewedding;

  // Once the refetched row arrives, show what is stored now (state adjusted during render).
  if (staleVersion !== undefined && (current?.version ?? null) !== staleVersion) {
    setStaleVersion(undefined);
    setValues(valuesOf(contract));
  }

  const fail = (error: unknown, notFound: string) => {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 412 || error.status === 428) {
      setBanner(PREWEDDING_CHANGED);
      setStaleVersion(current?.version ?? null);
    } else if (error.status === 404) {
      notify(notFound, { tone: "error" });
      onClose();
    } else if (error.status === 409) setBanner(error.detail);
    else if (error.status === 422) {
      const mapped: PreweddingErrors = {};
      const other: string[] = [];
      for (const { field, message } of error.errors) {
        if (FIELDS.some(({ key }) => key === field)) mapped[field as keyof PreweddingValues] = message;
        else other.push(field ? `${field}: ${message}` : message);
      }
      setErrors(mapped);
      if (other.length > 0) setBanner(other.join(" "));
    } else if (!isUnexpected(error)) setBanner(describeUnexpected(error));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validatePrewedding(values);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    try {
      await schedule.mutateAsync({
        contractId: contract.id,
        version: current?.version ?? null,
        body: toPreweddingRequest(values),
      });
      notify(current ? "Pré-wedding atualizado" : "Pré-wedding agendado");
      onClose();
    } catch (error) {
      fail(error, NOT_FOUND_IN_LIST);
    }
  };

  const unschedule = async () => {
    if (!current || busy) return;
    try {
      await cancel.mutateAsync({ contractId: contract.id, version: current.version });
      notify("Pré-wedding desmarcado");
      onClose();
    } catch (error) {
      setConfirming(false);
      fail(error, PREWEDDING_ALREADY_CANCELLED);
    }
  };

  // A save that finishes late would close whichever dialog is open by then.
  const close = () => {
    if (!busy) onClose();
  };

  const set = (key: keyof PreweddingValues, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <Dialog open title="Pré-wedding" onClose={close}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <p>{coupleLabel(contract.groom, contract.bride)}</p>
        {banner && <Banner tone="error">{banner}</Banner>}
        {FIELDS.map(({ key, label, type, hint }) => (
          <Field key={key} label={label} hint={hint} error={errors[key]}>
            {(control) => (
              <TextInput
                {...control}
                type={type}
                value={values[key]}
                onChange={(event) => set(key, event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
        ))}
        {confirming && current ? (
          <>
            <Banner tone="info">Desmarcar o pré-wedding de {formatIsoDate(current.date)}?</Banner>
            <DialogActions>
              <Button onClick={() => setConfirming(false)} disabled={busy}>
                Voltar
              </Button>
              <Button variant="danger" onClick={() => void unschedule()} busy={busy}>
                Desmarcar
              </Button>
            </DialogActions>
          </>
        ) : (
          <DialogActions>
            {current && (
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
                Desmarcar pré-wedding
              </Button>
            )}
            <Button onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" busy={busy}>
              Salvar
            </Button>
          </DialogActions>
        )}
      </form>
    </Dialog>
  );
}
```

Run `npx prettier --write` on the new files if the `FIELDS` type line is too long.

- [ ] **Step 7: Add the button to the list**

In `frontend/src/features/contracts/ContractListPage.tsx`:
- import `PreweddingDialog` from `./PreweddingDialog` and `preweddingButtonLabel` from `./preweddingForm`;
- add state `const [preweddingFor, setPreweddingFor] = useState<string | null>(null);` and, after `rows` is computed, `const preweddingTarget = rows.find((row) => row.id === preweddingFor) ?? null;`;
- in the non-deleted actions `<span>`, before **Editar**:

```tsx
            {(contract.has_prewedding || contract.prewedding !== null) && (
              <Button onClick={() => setPreweddingFor(contract.id)}>
                {preweddingButtonLabel(contract.prewedding)}
              </Button>
            )}
```

- after the delete `ConfirmDialog`:

```tsx
      {preweddingTarget && (
        <PreweddingDialog contract={preweddingTarget} onClose={() => setPreweddingFor(null)} />
      )}
```

- [ ] **Step 8: Run the tests**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Run the frontend checks and commit**

Run: `make check-frontend`
Expected: exit 0.

```bash
git add frontend/src
git commit -m "feat: schedule, change and unschedule a pre-wedding from the contracts list"
```

---

### Task 5: Pré-wedding section in the contract form

**Files:**
- Modify: `frontend/src/features/contracts/formModel.ts`, `frontend/src/features/contracts/formModel.test.ts`
- Modify: `frontend/src/features/contracts/serviceOptions.ts`, `frontend/src/features/contracts/serviceOptions.test.ts`
- Create: `frontend/src/features/contracts/sections/PreweddingSection.tsx`
- Modify: `frontend/src/features/contracts/ContractForm.tsx`
- Modify: `frontend/src/features/contracts/EditContract.tsx`
- Modify: `frontend/src/ui/ConfirmDialog.tsx`
- Modify: `frontend/src/features/contracts/ContractFormPage.create.test.tsx` (append)
- Modify: `frontend/src/features/contracts/ContractFormPage.edit.test.tsx` (append)

**Interfaces:**
- Consumes (Task 4): `PreweddingValues`, `emptyPrewedding`, `isBlankPrewedding`, `validatePrewedding`, `toPreweddingRequest`, `preweddingSummary`, `ApiError.code`; (Task 3) `ContractOut.prewedding`, `ContractPatch.cancel_prewedding`, `ContractCreate.prewedding`.
- Produces:
  - `ContractFormValues.prewedding: PreweddingValues`; `toRequest` adds `prewedding` only when the section is not blank.
  - `preweddingServiceIds(services: ServiceOut[]): Set<string>` in `serviceOptions.ts`.
  - `ContractForm` prop `prewedding?: PreweddingOut | null` (absent = creating, editable section; present = read-only summary).
  - `ConfirmDialog` prop `cancelLabel?: string` (default `"Cancelar"`).

- [ ] **Step 1: Write the failing model tests**

Append to `frontend/src/features/contracts/formModel.test.ts` (reuse its existing `valid()` helper):

```ts
test("a blank pre-wedding is left out of the request", () => {
  expect(toRequest(valid())).not.toHaveProperty("prewedding");
});

test("a filled pre-wedding is sent and needs a date and a place", () => {
  const values = {
    ...valid(),
    prewedding: { date: "", venue_name: "Parque", venue_address: "", start_time: "16:00" },
  };
  expect(validate(values)).toEqual({ "prewedding.date": "campo obrigatório" });
  values.prewedding.date = "2027-01-20";
  expect(validate(values)).toEqual({});
  expect(toRequest(values).prewedding).toEqual({
    date: "2027-01-20",
    venue_name: "Parque",
    venue_address: null,
    start_time: "16:00",
  });
});

test("pre-wedding fields are form fields for server errors", () => {
  expect(isFormField("prewedding.venue_name", 1)).toBe(true);
  expect(isFormField("prewedding", 1)).toBe(false);
});
```

(Import `isFormField` and `validate` if the file does not already.)

Append to `frontend/src/features/contracts/serviceOptions.test.ts`:

```ts
test("pre-wedding service ids include archived ones", () => {
  expect(preweddingServiceIds(SERVICES)).toEqual(new Set([IDS.servicePrewedding]));
  const archived = makeService({ id: "old", is_prewedding: true, archived_at: "2026-01-01T00:00:00Z" });
  expect(preweddingServiceIds([archived]).has("old")).toBe(true);
});
```

(Import `preweddingServiceIds` and, from `../../test/fixtures`, `IDS`, `SERVICES`, `makeService` as needed.)

Run: `cd frontend && npx vitest run src/features/contracts/formModel.test.ts src/features/contracts/serviceOptions.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement the model changes**

`serviceOptions.ts`, append:

```ts
/** Every service marked as a pre-wedding shoot, archived or not. */
export function preweddingServiceIds(services: ServiceOut[]): Set<string> {
  return new Set(services.filter((service) => service.is_prewedding).map((service) => service.id));
}
```

`formModel.ts`:
- import `PreweddingValues`, `emptyPrewedding`, `isBlankPrewedding`, `toPreweddingRequest`, `validatePrewedding` from `./preweddingForm`;
- add `prewedding: PreweddingValues;` to `ContractFormValues` (after `signing`);
- add `prewedding: emptyPrewedding(),` to the objects returned by `defaultValues` and `fromContract` (the edit form never edits it);
- in `toRequest`, after `signing: …`:

```ts
    ...(isBlankPrewedding(values.prewedding)
      ? {}
      : { prewedding: toPreweddingRequest(values.prewedding) }),
```

- in `validate`, before `return errors;`:

```ts
  if (!isBlankPrewedding(values.prewedding)) {
    for (const [key, message] of Object.entries(validatePrewedding(values.prewedding))) {
      errors[`prewedding.${key}`] = message;
    }
  }
```

- add to `FIXED_FIELDS`: `"prewedding.date"`, `"prewedding.venue_name"`, `"prewedding.venue_address"`, `"prewedding.start_time"`.

Any test that builds a `ContractFormValues` literally (rather than from `defaultValues`/`fromContract`) needs `prewedding: emptyPrewedding()` added; `npx tsc --noEmit -p .` lists them.

Run the two test files. Expected: PASS.

- [ ] **Step 3: Write the failing page tests**

Append to `frontend/src/features/contracts/ContractFormPage.create.test.tsx` (it already has `setInput`, `fillValidContract`, `EXPECTED_REQUEST`, and a `beforeEach` that serves the PDF):

```tsx
async function pickPrewedding(user: UserEvent, index = 2) {
  await user.selectOptions(screen.getByLabelText(`Serviço do item ${index}`), "Ensaio de pré-wedding");
}

test("the pre-wedding section follows the pre-wedding item", async () => {
  const { user } = renderApp("/contratos/novo");
  await fillValidContract(user);
  expect(screen.queryByRole("group", { name: "Pré-wedding" })).toBeNull();

  await pickPrewedding(user);
  const section = screen.getByRole("group", { name: "Pré-wedding" });
  expect(within(section).getByText("Pode deixar em branco e agendar depois.")).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Serviço do item 2"), "Diária segundo fotógrafo");
  expect(screen.queryByRole("group", { name: "Pré-wedding" })).toBeNull();
});

test("a filled pre-wedding is sent with the contract", async () => {
  let body: Record<string, unknown> | undefined;
  server.use(
    http.post("/api/v1/contracts", async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await pickPrewedding(user);
  setInput(screen.getByLabelText("Data do pré-wedding"), "2027-01-20");
  await user.type(screen.getByLabelText("Local do pré-wedding"), "Parque Barigui");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(body?.prewedding).toEqual({
    date: "2027-01-20",
    venue_name: "Parque Barigui",
    venue_address: null,
    start_time: null,
  });
});

test("a half-filled pre-wedding asks for the missing date", async () => {
  const { user } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await pickPrewedding(user);
  await user.type(screen.getByLabelText("Local do pré-wedding"), "Parque Barigui");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  const section = screen.getByRole("group", { name: "Pré-wedding" });
  expect(await within(section).findByText("campo obrigatório")).toBeInTheDocument();
});

test("hidden pre-wedding values are not sent", async () => {
  let body: Record<string, unknown> | undefined;
  server.use(
    http.post("/api/v1/contracts", async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await pickPrewedding(user);
  await user.type(screen.getByLabelText("Local do pré-wedding"), "Parque Barigui");
  await user.selectOptions(screen.getByLabelText("Serviço do item 2"), "Diária segundo fotógrafo");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(body).toEqual(EXPECTED_REQUEST);
});
```

(`fillValidContract` leaves item 2 as "Diária segundo fotógrafo" with its default price, so after the swap back the request equals `EXPECTED_REQUEST`. If `FormSection`'s fieldset is not exposed as `role="group"` with its legend as the name, query `screen.getByText("Pré-wedding", { selector: "legend" }).closest("fieldset")` instead.)

Append to `frontend/src/features/contracts/ContractFormPage.edit.test.tsx`:

```tsx
const PRE_ITEMS = {
  items: [
    { service_id: IDS.serviceCeremony, description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
    { service_id: IDS.servicePrewedding, description: "Ensaio de pré-wedding", amount_cents: 80000 },
  ],
  pix_discount_cents: null,
  total_cents: 200000,
};
const SCHEDULED = {
  date: "2027-01-20",
  venue_name: "Parque Barigui",
  venue_address: null,
  start_time: "16:00:00",
  version: 2,
};

test("shows the pre-wedding as a read-only summary", async () => {
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true, prewedding: SCHEDULED }));
  renderApp(URL_PATH);
  expect(
    await screen.findByText("Pré-wedding: 20/01/2027 às 16:00 · Parque Barigui"),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Data do pré-wedding")).toBeNull();
});

test("shows when nothing is scheduled yet", async () => {
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true }));
  renderApp(URL_PATH);
  expect(await screen.findByText("Pré-wedding: não agendado")).toBeInTheDocument();
});

async function removePreweddingItem(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Remover item 2" }));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
}

test("removing the pre-wedding item asks before cancelling the schedule", async () => {
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true, prewedding: SCHEDULED }));
  const sent: unknown[] = [];
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(makeContract({ version: 2 }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  await removePreweddingItem(user);
  const confirm = screen.getByRole("dialog", { name: "Cancelar pré-wedding?" });
  expect(
    within(confirm).getByText(
      "Este contrato tem um pré-wedding agendado em 20/01/2027. Remover o item cancela esse agendamento.",
    ),
  ).toBeInTheDocument();
  await user.click(within(confirm).getByRole("button", { name: "Voltar" }));
  expect(sent).toEqual([]);

  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await user.click(screen.getByRole("button", { name: "Remover e salvar" }));
  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent).toEqual([
    {
      payment: {
        items: [{ service_id: IDS.serviceCeremony, amount_cents: 120000 }],
        pix_discount_cents: null,
      },
      cancel_prewedding: true,
    },
  ]);
});

test("a schedule made elsewhere is caught by the server and asked the same way", async () => {
  // The cached contract has no schedule, but the server has one.
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true }));
  const sent: Record<string, unknown>[] = [];
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      sent.push(body);
      return body.cancel_prewedding
        ? HttpResponse.json(makeContract({ version: 2 }))
        : problem(409, "o contrato tem um pré-wedding agendado", { code: "prewedding_scheduled" });
    }),
  );
  const { user } = renderApp(URL_PATH);
  await removePreweddingItem(user);
  const confirm = await screen.findByRole("dialog", { name: "Cancelar pré-wedding?" });
  expect(
    within(confirm).getByText(
      "Este contrato tem um pré-wedding agendado. Remover o item cancela esse agendamento.",
    ),
  ).toBeInTheDocument();
  await user.click(within(confirm).getByRole("button", { name: "Remover e salvar" }));
  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent.map((body) => body.cancel_prewedding)).toEqual([undefined, true]);
});
```

(Add `within` and `type UserEvent` imports to the edit test file.)

Run: `cd frontend && npx vitest run src/features/contracts/ContractFormPage.create.test.tsx src/features/contracts/ContractFormPage.edit.test.tsx`
Expected: FAIL.

- [ ] **Step 4: `cancelLabel` on `ConfirmDialog`**

In `frontend/src/ui/ConfirmDialog.tsx` add `cancelLabel?: string;` to `Props`, destructure `cancelLabel = "Cancelar"` in `ConfirmBody`, and render `{cancelLabel}` in place of the literal `Cancelar`.

- [ ] **Step 5: The section**

Create `frontend/src/features/contracts/sections/PreweddingSection.tsx`:

```tsx
import { useEffect } from "react";
import type { PreweddingOut } from "../../../api/client";
import { useServices } from "../../../api/services";
import { FormSection } from "../../../ui";
import styles from "../ContractForm.module.css";
import { emptyPrewedding, isBlankPrewedding, preweddingSummary } from "../preweddingForm";
import { preweddingServiceIds } from "../serviceOptions";
import type { ContractFormState } from "../useContractForm";
import { TextField } from "./TextField";

type Props = {
  state: ContractFormState;
  disabled: boolean;
  /** Absent while creating: the fields are editable. Otherwise the stored pre-wedding. */
  summary?: PreweddingOut | null;
};

export function PreweddingSection({ state, disabled, summary }: Props) {
  const { form } = state;
  const services = useServices(true);
  const ids = preweddingServiceIds(services.data ?? []);
  const included = state.values.payment.items.some((item) => ids.has(item.service_id));
  const editable = summary === undefined;

  // Values typed into a section that is now hidden must not be sent.
  useEffect(() => {
    if (editable && !included && !isBlankPrewedding(form.getValues("prewedding"))) {
      form.setValue("prewedding", emptyPrewedding());
      form.clearErrors("prewedding");
    }
  }, [editable, included, form]);

  if (editable) {
    if (!included) return null;
    return (
      <FormSection title="Pré-wedding" disabled={disabled}>
        <p className={styles.row}>Pode deixar em branco e agendar depois.</p>
        <TextField form={form} name="prewedding.date" label="Data do pré-wedding" type="date" />
        <TextField form={form} name="prewedding.venue_name" label="Local do pré-wedding" />
        <TextField
          form={form}
          name="prewedding.venue_address"
          label="Endereço do pré-wedding"
          hint="Opcional"
        />
        <TextField
          form={form}
          name="prewedding.start_time"
          label="Horário do pré-wedding"
          type="time"
          hint="Opcional"
        />
      </FormSection>
    );
  }

  if (!included && summary === null) return null;
  return (
    <FormSection title="Pré-wedding" disabled={disabled}>
      <p className={styles.row}>
        {summary ? `Pré-wedding: ${preweddingSummary(summary)}` : "Pré-wedding: não agendado"}
      </p>
      <p className={styles.row}>Para agendar ou alterar, use o botão de pré-wedding na lista de contratos.</p>
    </FormSection>
  );
}
```

In `ContractForm.tsx`: import `PreweddingOut` (type) and `PreweddingSection`; add to `Props`

```ts
  /** Absent while creating. When editing, the stored pre-wedding, shown read-only. */
  prewedding?: PreweddingOut | null;
```

destructure `prewedding`, and render after `<PaymentSection … />`:

```tsx
      <PreweddingSection state={state} disabled={readOnly} summary={prewedding} />
```

- [ ] **Step 6: The removal confirmation in `EditContract.tsx`**

Imports: `useServices` from `../../api/services`; `formatIsoDate` from `../../domain/dates`; `preweddingServiceIds` from `./serviceOptions`. Inside the component, next to the other hooks (before the early returns):

```tsx
  const services = useServices(true);
  const [pendingRemoval, setPendingRemoval] = useState<ContractPatch | null>(null);
```

Replace `submit` with:

```tsx
  const save = async (body: ContractPatch) => {
    try {
      await update.mutateAsync({ version: data.version, body });
      notify("Alterações salvas");
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) return setConflict(true);
      if (error instanceof ApiError && error.code === "prewedding_scheduled") {
        return setPendingRemoval(body);
      }
      if (error instanceof ApiError && error.status === 409) {
        return notify(EDIT_CONFLICT_DELETED, { tone: "error" });
      }
      throw error;
    }
  };

  const submit = async (values: ContractFormValues) => {
    // Sections are compared as API requests, so only real changes are sent.
    const body = changedSections(toRequest(fromContract(data)), toRequest(values)) as ContractPatch;
    const ids = preweddingServiceIds(services.data ?? []);
    const removesLast =
      data.payment.items.some((item) => ids.has(item.service_id)) &&
      !values.payment.items.some((item) => ids.has(item.service_id));
    if (data.prewedding && removesLast) return setPendingRemoval(body);
    await save(body);
  };

  const confirmRemoval = async () => {
    const body = pendingRemoval;
    if (!body) return;
    try {
      await save({ ...body, cancel_prewedding: true });
    } catch (error) {
      if (error instanceof ApiError && !isUnexpected(error)) {
        notify(describeUnexpected(error), { tone: "error" });
      }
    } finally {
      setPendingRemoval(null);
    }
  };
```

Pass `prewedding={data.prewedding}` to `<ContractForm>`, and add a second dialog after the conflict `ConfirmDialog`:

```tsx
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Cancelar pré-wedding?"
        confirmLabel="Remover e salvar"
        cancelLabel="Voltar"
        tone="danger"
        busy={update.isPending}
        onConfirm={() => void confirmRemoval()}
        onCancel={() => setPendingRemoval(null)}
      >
        <p>
          {data.prewedding
            ? `Este contrato tem um pré-wedding agendado em ${formatIsoDate(data.prewedding.date)}.`
            : "Este contrato tem um pré-wedding agendado."}{" "}
          Remover o item cancela esse agendamento.
        </p>
      </ConfirmDialog>
```

Check the rendered text matches the tests exactly (one space between the sentences); adjust the JSX if Testing Library sees a different string.

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Run the frontend checks and commit**

Run: `make check-frontend`
Expected: exit 0.

```bash
git add frontend/src
git commit -m "feat: enter the pre-wedding when creating a contract and confirm before cancelling it"
```

---

### Task 6: End-to-end walk-through and README

**Files:**
- Modify: `frontend/e2e/helpers.ts:6-9`
- Create: `frontend/e2e/prewedding.spec.ts`
- Modify: `README.md` (after the Serviços paragraph near line 38-50)

**Interfaces:**
- Consumes: everything above; e2e helpers `test`, `expect`, `fillContract`, `freshCouple`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the pre-wedding service to the e2e catalog**

In `frontend/e2e/helpers.ts`, add to `SERVICES`:

```ts
  { name: "Ensaio de pré-wedding", default_price_cents: 80000, is_prewedding: true },
```

- [ ] **Step 2: Write the walk-through**

Create `frontend/e2e/prewedding.spec.ts`:

```ts
import { expect, fillContract, freshCouple, test } from "./helpers";

test("schedule a pre-wedding from the list, then cancel it by removing its item", async ({
  page,
}) => {
  const couple = freshCouple();
  await page.goto("/contratos/novo");
  await fillContract(page, couple);
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: "Ensaio de pré-wedding" });
  await expect(page.getByText("Pode deixar em branco e agendar depois.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await download;
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const contractUrl = page.url();
  await expect(page.getByText("Pré-wedding: não agendado")).toBeVisible();

  await page.goto("/contratos");
  const row = page.getByRole("row", { name: new RegExp(couple.label) });
  await row.getByRole("button", { name: "Agendar pré-wedding" }).click();
  const dialog = page.getByRole("dialog", { name: "Pré-wedding" });
  await dialog.getByLabel("Data").fill("2027-01-20");
  await dialog.getByLabel("Local").fill("Parque Barigui");
  await dialog.getByLabel("Horário").fill("16:00");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Pré-wedding agendado")).toBeVisible();
  await expect(row.getByRole("button", { name: "Pré-wedding 20/01" })).toBeVisible();

  await page.goto(contractUrl);
  await expect(
    page.getByText("Pré-wedding: 20/01/2027 às 16:00 · Parque Barigui"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remover item 3" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("button", { name: "Remover e salvar" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();

  await page.goto("/contratos");
  await expect(
    page.getByRole("row", { name: new RegExp(couple.label) }).getByRole("button", {
      name: /pré-wedding/i,
    }),
  ).toHaveCount(0);
});
```

- [ ] **Step 3: Run it**

Run: `make e2e`
Expected: all specs pass (7 of 7).

- [ ] **Step 4: Document it**

In `README.md`, after the paragraph about the **Serviços** screen and pre-wedding services, add:

```markdown
### Pré-wedding

A contract that includes a pre-wedding service can carry its pre-wedding
shoot: a date and a place, plus an optional address and start time. Fill it in
when creating the contract, or leave it blank and use the **Agendar
pré-wedding** button on the contracts list once the client has a date. The
same button (then labelled with the date) changes or unschedules it. None of
this changes the contract, its version or its PDF.

Removing the last pre-wedding item from a contract asks for confirmation and
cancels the scheduled pre-wedding in the same save.

Upgrading adds an empty `prewedding_events` table (migration `0003`); no
existing data changes. Back up `data/gerenciador.db` first anyway.
```

- [ ] **Step 5: Run everything and commit**

Run: `make check && make e2e`
Expected: both exit 0.

```bash
git add frontend/e2e/helpers.ts frontend/e2e/prewedding.spec.ts README.md
git commit -m "test: walk through scheduling and cancelling a pre-wedding and document it"
```
