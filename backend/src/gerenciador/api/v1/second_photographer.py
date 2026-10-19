from uuid import UUID

from fastapi import APIRouter, Response

from gerenciador.api.deps import Ctx, SecondPhotographer
from gerenciador.api.v1.schemas import (
    OverrideIn,
    OverrideOut,
    PriceIn,
    PricesOut,
)

router = APIRouter(tags=["second-photographer"])


@router.get("/second-photographer-fee")
def get_second_photographer_fee(service: SecondPhotographer) -> PricesOut:
    return PricesOut.from_views(service.standard())


@router.post("/second-photographer-fee/prices")
def set_second_photographer_fee(body: PriceIn, ctx: Ctx, service: SecondPhotographer) -> PricesOut:
    return PricesOut.from_views(service.set_standard(ctx, body.from_month, body.amount_cents))


@router.put("/contracts/{contract_id}/second-photographer-fee")
def set_override(
    contract_id: UUID, body: OverrideIn, ctx: Ctx, service: SecondPhotographer
) -> OverrideOut:
    amount = service.set_override(ctx, str(contract_id), body.amount_cents)
    return OverrideOut(contract_id=str(contract_id), amount_cents=amount)


@router.delete("/contracts/{contract_id}/second-photographer-fee", status_code=204)
def clear_override(contract_id: UUID, ctx: Ctx, service: SecondPhotographer) -> Response:
    service.clear_override(ctx, str(contract_id))
    return Response(status_code=204)
