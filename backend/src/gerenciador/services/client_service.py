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
