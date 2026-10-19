"""Request and response models for API v1."""

import datetime as dt
import unicodedata
from dataclasses import asdict
from typing import Annotated, Any, Literal, Self
from uuid import UUID

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    model_validator,
)

from gerenciador.db.models import AuditEvent
from gerenciador.domain.cpf import format_cpf, mask_cpf, normalize_cpf
from gerenciador.services.agenda_service import AgendaEntry
from gerenciador.services.catalog_service import ServiceChanges, ServiceInput, ServiceView
from gerenciador.services.client_service import ClientExport, ClientView
from gerenciador.services.contract_service import (
    ContractInput,
    ContractView,
    InstalmentInput,
    InstalmentView,
    ItemInput,
    PersonInput,
)
from gerenciador.services.expense_entry_service import ExpenseEntry
from gerenciador.services.expense_service import EventChoice, ExpenseInput, ExpenseView, TripInput
from gerenciador.services.expense_type_service import ExpenseTypeView
from gerenciador.services.fixed_cost_service import FixedCostView, PriceView
from gerenciador.services.instalment_service import InstalmentListEntry
from gerenciador.services.overview_service import OverviewView, StatementIn
from gerenciador.services.prewedding_service import PreweddingInput, PreweddingView


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
ExpenseTypeName = Annotated[str, Field(min_length=1, max_length=60), _Printable]
FixedCostName = Annotated[str, Field(min_length=1, max_length=100), _Printable]
Address = Annotated[str, Field(min_length=1, max_length=300), _Printable]
City = Annotated[str, Field(min_length=1, max_length=100), _Printable]
OptionalAddress = Annotated[Address | None, BeforeValidator(_blank_to_none)]
OptionalTime = Annotated[dt.time | None, BeforeValidator(_blank_to_none)]
Hours = Annotated[int, Field(strict=True, ge=1, le=24)]
PhotographerCount = Annotated[int, Field(strict=True, ge=1, le=10)]
Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Cents = Annotated[int, Field(strict=True, gt=0, le=100_000_000)]
Description = Annotated[
    Annotated[str, Field(max_length=200), _Printable] | None, BeforeValidator(_blank_to_none)
]
DistanceTenths = Annotated[int, Field(strict=True, ge=1, le=50_000)]
EventKind = Literal["wedding", "prewedding"]
TransportKind = Literal["car", "ride_app", "bus", "plane", "other"]
ClockTime = Annotated[dt.time, PlainSerializer(lambda t: t.strftime("%H:%M"), return_type=str)]
Flag = Annotated[bool, Field(strict=True)]
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


class PreweddingIn(StrictModel):
    date: dt.date
    venue_name: Name
    venue_address: OptionalAddress = None
    start_time: OptionalTime = None

    def to_input(self) -> PreweddingInput:
        return PreweddingInput(self.date, self.venue_name, self.venue_address, self.start_time)


class InstalmentIn(StrictModel):
    month: Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
    amount_cents: Cents


class ContractBody(StrictModel):
    """The contract fields shared by a create and a patched contract; the plan differs."""

    groom: PersonIn
    bride: PersonIn
    couple_address: Address
    event: EventIn
    photographer_count: PhotographerCount = 2
    payment: PaymentIn
    signing: SigningIn = Field(default_factory=SigningIn)
    prewedding: PreweddingIn | None = None

    def _input(self, instalments: list[InstalmentIn] | None) -> ContractInput:
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
            prewedding=self.prewedding.to_input() if self.prewedding is not None else None,
            instalments=(
                [InstalmentInput(i.month, i.amount_cents) for i in instalments]
                if instalments is not None
                else None
            ),
        )


class ContractCreate(ContractBody):
    instalments: list[InstalmentIn] = Field(min_length=1, max_length=4)

    def to_input(self) -> ContractInput:
        return self._input(self.instalments)


class PatchedContract(ContractBody):
    """A contract after a patch. `instalments` is None when the plan was not sent."""

    instalments: list[InstalmentIn] | None = None

    def to_input(self) -> ContractInput:
        return self._input(self.instalments)


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
    instalments: list[InstalmentIn] | None = Field(default=None, min_length=1, max_length=4)
    cancel_prewedding: Flag = False

    def apply_to(self, view: ContractView) -> PatchedContract:
        """The contract as it would be after this patch, validated as a whole.

        Raises pydantic.ValidationError if the result is not a valid contract.
        """
        merged = _merge(
            _as_request(view),
            self.model_dump(exclude_unset=True, exclude={"cancel_prewedding"}),
        )
        return PatchedContract.model_validate(merged)


class ClientPatch(StrictModel):
    full_name: Name | None = None
    cpf: Cpf | None = None
    address: Address | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> Self:
        if self.full_name is None and self.cpf is None and self.address is None:
            raise ValueError("informe ao menos um campo")
        return self


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
        if self.name is None and self.default_price_cents is None and self.is_prewedding is None:
            raise ValueError("informe ao menos um campo")
        return self

    def to_changes(self) -> ServiceChanges:
        return ServiceChanges(self.name, self.default_price_cents, self.is_prewedding)


class ExpenseTypeIn(StrictModel):
    name: ExpenseTypeName


class ExpenseTypePatch(StrictModel):
    name: ExpenseTypeName


class TripIn(StrictModel):
    contract_id: UUID
    event_kind: EventKind
    transport_kind: TransportKind
    left_home_at: dt.time
    distance_tenths: DistanceTenths

    def to_input(self) -> TripInput:
        return TripInput(
            str(self.contract_id),
            self.event_kind,
            self.transport_kind,
            self.left_home_at.replace(second=0, microsecond=0, tzinfo=None),
            self.distance_tenths,
        )


class ExpenseIn(StrictModel):
    spent_on: dt.date
    amount_cents: Cents
    type_id: UUID
    description: Description = None
    trip: TripIn | None = None

    def to_input(self) -> ExpenseInput:
        return ExpenseInput(
            self.spent_on,
            self.amount_cents,
            str(self.type_id),
            self.description,
            self.trip.to_input() if self.trip else None,
        )


class FixedCostIn(StrictModel):
    name: FixedCostName
    type_id: UUID
    day_of_month: Annotated[int, Field(strict=True, ge=1, le=31)]
    start_month: Month
    amount_cents: Cents


class FixedCostRename(StrictModel):
    name: FixedCostName


class PriceIn(StrictModel):
    from_month: Month
    amount_cents: Cents


class StopIn(StrictModel):
    end_month: Month


class OverrideIn(StrictModel):
    amount_cents: Cents


# ---- responses ------------------------------------------------------------


class PageOut[T](BaseModel):
    items: list[T]
    next_cursor: str | None


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


class ExpenseTypeOut(BaseModel):
    id: str
    name: str
    key: str | None
    archived_at: dt.datetime | None
    version: int

    @classmethod
    def from_view(cls, view: ExpenseTypeView) -> Self:
        return cls(
            id=view.id,
            name=view.name,
            key=view.key,
            archived_at=view.archived_at,
            version=view.version,
        )


class TripOut(BaseModel):
    contract_id: str
    event_kind: EventKind
    transport_kind: str
    left_home_at: ClockTime
    distance_tenths: int


class ExpenseOut(BaseModel):
    id: str
    spent_on: dt.date
    amount_cents: int
    type_id: str
    description: str | None
    trip: TripOut | None
    version: int
    created_at: dt.datetime

    @classmethod
    def from_view(cls, view: ExpenseView) -> Self:
        return cls(
            id=view.id,
            spent_on=view.spent_on,
            amount_cents=view.amount_cents,
            type_id=view.type_id,
            description=view.description,
            trip=TripOut.model_validate(asdict(view.trip)) if view.trip else None,
            version=view.version,
            created_at=view.created_at,
        )


class PriceOut(BaseModel):
    from_month: str
    amount_cents: int


class PricesOut(BaseModel):
    prices: list[PriceOut]

    @classmethod
    def from_views(cls, views: list[PriceView]) -> Self:
        return cls(prices=[PriceOut.model_validate(asdict(view)) for view in views])


class FixedCostOut(BaseModel):
    id: str
    name: str
    type_id: str
    type_name: str
    day_of_month: int
    start_month: str
    end_month: str | None
    prices: list[PriceOut]
    version: int

    @classmethod
    def from_view(cls, view: FixedCostView) -> Self:
        return cls.model_validate(asdict(view))


class OverrideOut(BaseModel):
    contract_id: str
    amount_cents: int


class ExpenseEventOut(BaseModel):
    contract_id: str
    event_kind: EventKind
    date: dt.date
    groom_name: str | None
    bride_name: str | None
    venue_name: str
    venue_address: str | None

    @classmethod
    def from_view(cls, view: EventChoice) -> Self:
        return cls.model_validate(asdict(view))


class ExpenseEntryOut(BaseModel):
    id: str
    source: Literal["manual", "fixed", "second_photographer"]
    date: dt.date
    amount_cents: int
    missing_amount: bool
    type_id: str
    type_name: str
    type_key: str | None
    description: str | None
    expense_id: str | None
    version: int | None
    fixed_cost_id: str | None
    contract_id: str | None
    event_kind: EventKind | None
    groom_name: str | None
    bride_name: str | None
    link_state: Literal["ok", "contract_deleted", "prewedding_cancelled"] | None
    venue_name: str | None
    venue_address: str | None
    transport_kind: str | None
    left_home_at: ClockTime | None
    distance_tenths: int | None
    override: bool


class ExpenseEntriesOut(BaseModel):
    entries: list[ExpenseEntryOut]
    total_cents: int

    @classmethod
    def from_entries(cls, entries: list[ExpenseEntry]) -> Self:
        return cls(
            entries=[ExpenseEntryOut.model_validate(asdict(entry)) for entry in entries],
            total_cents=sum(entry.amount_cents for entry in entries),
        )


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


class InstalmentOut(BaseModel):
    number: int
    month: str
    amount_cents: int
    paid_on: dt.date | None

    @classmethod
    def from_view(cls, view: InstalmentView) -> Self:
        return cls(
            number=view.number,
            month=view.month,
            amount_cents=view.amount_cents,
            paid_on=view.paid_on,
        )


class MarkPaidIn(StrictModel):
    paid_on: dt.date


class InstalmentListItem(BaseModel):
    contract_id: str
    groom_name: str | None
    bride_name: str | None
    number: int
    count: int
    month: str
    amount_cents: int
    paid_on: dt.date | None
    plan_needs_review: bool

    @classmethod
    def from_entry(cls, entry: InstalmentListEntry) -> Self:
        return cls(**asdict(entry))


class SigningOut(BaseModel):
    city: str
    date: dt.date


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


class AgendaPersonOut(BaseModel):
    full_name: str | None


class AgendaEntryOut(BaseModel):
    contract_id: str
    kind: Literal["wedding", "prewedding"]
    date: dt.date
    start_time: dt.time | None
    venue_name: str
    groom: AgendaPersonOut
    bride: AgendaPersonOut

    @classmethod
    def from_entry(cls, entry: AgendaEntry) -> Self:
        return cls(
            contract_id=entry.contract_id,
            kind=entry.kind,
            date=entry.date,
            start_time=entry.start_time,
            venue_name=entry.venue_name,
            groom=AgendaPersonOut(full_name=entry.groom_name),
            bride=AgendaPersonOut(full_name=entry.bride_name),
        )


class ContractOut(BaseModel):
    id: str
    groom: ClientOut
    bride: ClientOut
    couple_address: str | None
    event: EventOut
    photographer_count: int
    payment: PaymentOut
    signing: SigningOut
    instalments: list[InstalmentOut]
    plan_needs_review: bool
    has_prewedding: bool
    prewedding: PreweddingOut | None
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
            instalments=[InstalmentOut.from_view(i) for i in view.instalments],
            plan_needs_review=view.plan_needs_review,
            has_prewedding=view.has_prewedding,
            prewedding=PreweddingOut.from_view(view.prewedding)
            if view.prewedding is not None
            else None,
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


class TypeShareOut(BaseModel):
    type_id: str
    type_name: str
    palette_slot: int | None
    amount_cents: int


class StatementInOut(BaseModel):
    kind: Literal["in"] = "in"
    date: dt.date
    amount_cents: int
    contract_id: str
    number: int
    count: int
    groom_name: str | None
    bride_name: str | None
    contract_deleted: bool


class StatementOutOut(BaseModel):
    kind: Literal["out"] = "out"
    date: dt.date
    amount_cents: int
    entry: ExpenseEntryOut


StatementRowOut = Annotated[StatementInOut | StatementOutOut, Field(discriminator="kind")]


class UpcomingMonthOut(BaseModel):
    month: str
    rest_of_month: bool
    in_cents: int
    out_cents: int
    projected_free_cents: int


class OverviewOut(BaseModel):
    period_start: dt.date
    period_end: dt.date
    not_started: bool
    in_cents: int
    out_cents: int
    by_type: list[TypeShareOut]
    missing_fee_count: int
    free_today_cents: int
    opening_cents: int
    statement: list[StatementRowOut]
    upcoming: list[UpcomingMonthOut]
    late_cents: int

    @classmethod
    def from_view(cls, view: OverviewView) -> Self:
        rows: list[StatementInOut | StatementOutOut] = [
            StatementInOut.model_validate(asdict(row))
            if isinstance(row, StatementIn)
            else StatementOutOut(
                date=row.date,
                amount_cents=row.amount_cents,
                entry=ExpenseEntryOut.model_validate(asdict(row.entry)),
            )
            for row in view.statement
        ]
        return cls(
            **{k: v for k, v in asdict(view).items() if k not in ("statement",)},
            statement=rows,
        )
