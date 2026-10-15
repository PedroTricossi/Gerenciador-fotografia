"""Request and response models for API v1."""

import datetime as dt
import unicodedata
from typing import Annotated, Any, Self
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    model_validator,
)

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


def _no_control_characters(value: str) -> str:
    """Refuse NUL, tab, newline and every other character in Unicode category Cc."""
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise ValueError("não pode conter caracteres de controle")
    return value


def _to_utc(value: dt.datetime) -> dt.datetime:
    """A moment at the edge of the calendar cannot be expressed in UTC."""
    try:
        return value.astimezone(dt.UTC)
    except OverflowError as exc:
        raise ValueError("data fora do intervalo permitido") from exc


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Cpf = Annotated[str, Field(max_length=20), AfterValidator(normalize_cpf)]
_Printable = AfterValidator(_no_control_characters)
Name = Annotated[str, Field(min_length=1, max_length=200), _Printable]
Address = Annotated[str, Field(min_length=1, max_length=300), _Printable]
City = Annotated[str, Field(min_length=1, max_length=100), _Printable]
OptionalAddress = Annotated[Address | None, BeforeValidator(_blank_to_none)]
OptionalTime = Annotated[dt.time | None, BeforeValidator(_blank_to_none)]
Hours = Annotated[int, Field(strict=True, ge=1, le=24)]
PhotographerCount = Annotated[int, Field(strict=True, ge=1, le=10)]
Cents = Annotated[int, Field(strict=True, gt=0, le=100_000_000)]
UtcDatetime = Annotated[AwareDatetime, AfterValidator(_to_utc)]


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
    service_id: UUID
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
            items=[
                ItemInput(str(item.service_id), item.amount_cents) for item in self.payment.items
            ],
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
                {"service_id": item.service_id, "amount_cents": item.amount_cents}
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
    service_id: str
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
                    ItemOut(
                        service_id=item.service_id,
                        description=item.description,
                        amount_cents=item.amount_cents,
                    )
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
