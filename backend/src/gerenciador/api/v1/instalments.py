"""Marking instalments paid, and the cross-contract list for the business area."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from gerenciador.api.deps import Ctx, Instalments
from gerenciador.api.v1.schemas import InstalmentListItem, InstalmentOut, MarkPaidIn

router = APIRouter(tags=["instalments"])


@router.post("/contracts/{contract_id}/instalments/{number}/paid")
def mark_paid(
    contract_id: UUID, number: int, body: MarkPaidIn, ctx: Ctx, service: Instalments
) -> InstalmentOut:
    return InstalmentOut.from_view(service.mark_paid(ctx, str(contract_id), number, body.paid_on))


@router.delete("/contracts/{contract_id}/instalments/{number}/paid")
def mark_unpaid(contract_id: UUID, number: int, ctx: Ctx, service: Instalments) -> InstalmentOut:
    return InstalmentOut.from_view(service.mark_unpaid(ctx, str(contract_id), number))


@router.get("/instalments")
def list_instalments(
    service: Instalments,
    unpaid_through: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
) -> list[InstalmentListItem]:
    return [InstalmentListItem.from_entry(entry) for entry in service.list(unpaid_through)]
