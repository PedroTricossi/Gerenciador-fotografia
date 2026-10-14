"""Contracts: create, read, edit, soft delete and restore."""

import datetime as dt
from collections.abc import Callable
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
            ctx,
            "contract.created",
            entity_type=_ENTITY,
            entity_id=contract.id,
            details={"version": 1},
        )
        self._session.commit()
        return self._to_view(contract)

    def get(self, contract_id: str) -> ContractView:
        return self._to_view(self._require(contract_id))

    def list_page(
        self, *, limit: int, cursor: str | None, include_deleted: bool
    ) -> Page[ContractView]:
        before = decode_cursor(cursor) if cursor is not None else None
        rows = self._repo.find_page(limit=limit + 1, before=before, include_deleted=include_deleted)
        next_cursor = (
            encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id)
            if len(rows) > limit
            else None
        )
        return Page(items=[self._to_view(row) for row in rows[:limit]], next_cursor=next_cursor)

    def update(
        self, ctx: RequestContext, contract_id: str, expected_version: int, data: ContractInput
    ) -> ContractView:
        contract = self._editable(contract_id, expected_version)
        return self._apply_update(ctx, contract, data)

    def patch(
        self,
        ctx: RequestContext,
        contract_id: str,
        expected_version: int,
        apply: Callable[[ContractView], ContractInput],
    ) -> ContractView:
        """Edit a contract from a function of its current state.

        Checks run in order: not found, deleted, stale version. Only then is `apply` called;
        whatever it raises propagates and nothing is stored.
        """
        contract = self._editable(contract_id, expected_version)
        return self._apply_update(ctx, contract, apply(self._to_view(contract)))

    def _editable(self, contract_id: str, expected_version: int) -> Contract:
        contract = self._require(contract_id)
        if contract.deleted_at is not None:
            raise ConflictError("contract is deleted; restore it before editing")
        if contract.version != expected_version:
            raise StaleVersionError
        return contract

    def _apply_update(
        self, ctx: RequestContext, contract: Contract, data: ContractInput
    ) -> ContractView:
        _check_rules(data)
        current = self._to_view(contract)
        previous = (contract.groom, contract.bride)
        groom = self._upsert(ctx, data.groom, data.couple_address, editing=contract.id)
        bride = self._upsert(ctx, data.bride, data.couple_address, editing=contract.id)

        changed: list[str] = []
        if contract.groom_id != groom.id or current.groom.full_name != data.groom.full_name:
            contract.groom = groom
            changed.append("groom")
        if contract.bride_id != bride.id or current.bride.full_name != data.bride.full_name:
            contract.bride = bride
            changed.append("bride")
        if (
            current.groom.address != data.couple_address
            or current.bride.address != data.couple_address
        ):
            changed.append("couple_address")
        for field in _SCALAR_FIELDS:
            if getattr(contract, field) != getattr(data, field):
                setattr(contract, field, getattr(data, field))
                changed.append(field)
        current_items = [(item.description, item.amount_cents) for item in contract.items]
        if current_items != [(item.description, item.amount_cents) for item in data.items]:
            contract.items = _new_items(data)
            changed.append("items")

        if changed:
            # The contract must already point at its new clients when the old ones
            # are checked for remaining references.
            self._session.flush()
            for client in previous:
                if client.id not in (groom.id, bride.id):
                    self._clients.release_replaced(ctx, client, contract_id=contract.id)
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

    def _upsert(
        self, ctx: RequestContext, person: PersonInput, address: str, editing: str | None = None
    ) -> Client:
        return self._clients.upsert_for_contract(
            ctx,
            full_name=person.full_name,
            cpf=person.cpf,
            address=address,
            editing_contract_id=editing,
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
