"""SQLAlchemy models. Personal data lives only in `clients`."""

import datetime as dt
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator[dt.datetime]):
    """Stores UTC, returns timezone-aware datetimes, refuses naive ones."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: dt.datetime | None, dialect: Dialect) -> dt.datetime | None:
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


class Contract(Base):
    __tablename__ = "contracts"
    __table_args__ = (
        CheckConstraint("groom_id <> bride_id", name="ck_contracts_distinct_clients"),
    )

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
    __table_args__ = (
        UniqueConstraint("contract_id", "service_id", name="uq_contract_items_service"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("contracts.id"))
    service_id: Mapped[str] = mapped_column(
        ForeignKey("services.id", name="fk_contract_items_service_id_services")
    )
    position: Mapped[int]
    description: Mapped[str] = mapped_column(String(200))
    amount_cents: Mapped[int]

    service: Mapped[Service] = relationship(lazy="joined")


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
