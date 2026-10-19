from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response

from gerenciador.api.deps import Ctx, FixedCosts
from gerenciador.api.v1.schemas import (
    FixedCostIn,
    FixedCostOut,
    FixedCostRename,
    PriceIn,
    StopIn,
)
from gerenciador.api.v1.versioning import expected_version
from gerenciador.services.fixed_cost_service import FixedCostView

router = APIRouter(prefix="/fixed-costs", tags=["fixed-costs"])


def _respond(view: FixedCostView, response: Response) -> FixedCostOut:
    response.headers["ETag"] = f'"{view.version}"'
    return FixedCostOut.from_view(view)


@router.get("")
def list_fixed_costs(service: FixedCosts) -> list[FixedCostOut]:
    return [FixedCostOut.from_view(view) for view in service.list_fixed_costs()]


@router.post("", status_code=201)
def create_fixed_cost(
    body: FixedCostIn, response: Response, ctx: Ctx, service: FixedCosts
) -> FixedCostOut:
    view = service.create(
        ctx,
        body.name,
        str(body.type_id),
        body.day_of_month,
        body.start_month,
        body.amount_cents,
    )
    response.headers["Location"] = f"/api/v1/fixed-costs/{view.id}"
    return _respond(view, response)


@router.patch("/{cost_id}")
def rename_fixed_cost(
    cost_id: UUID,
    body: FixedCostRename,
    response: Response,
    ctx: Ctx,
    service: FixedCosts,
    if_match: Annotated[str | None, Header()] = None,
) -> FixedCostOut:
    version = expected_version(if_match, "fixed cost")
    return _respond(service.rename(ctx, str(cost_id), version, body.name), response)


@router.post("/{cost_id}/prices")
def set_fixed_cost_price(
    cost_id: UUID, body: PriceIn, response: Response, ctx: Ctx, service: FixedCosts
) -> FixedCostOut:
    view = service.set_price(ctx, str(cost_id), body.from_month, body.amount_cents)
    return _respond(view, response)


@router.post("/{cost_id}/stop")
def stop_fixed_cost(
    cost_id: UUID, body: StopIn, response: Response, ctx: Ctx, service: FixedCosts
) -> FixedCostOut:
    return _respond(service.stop(ctx, str(cost_id), body.end_month), response)


@router.post("/{cost_id}/resume")
def resume_fixed_cost(
    cost_id: UUID, response: Response, ctx: Ctx, service: FixedCosts
) -> FixedCostOut:
    return _respond(service.resume(ctx, str(cost_id)), response)


@router.delete("/{cost_id}", status_code=204)
def delete_fixed_cost(
    cost_id: UUID,
    ctx: Ctx,
    service: FixedCosts,
    if_match: Annotated[str | None, Header()] = None,
) -> Response:
    service.delete(ctx, str(cost_id), expected_version(if_match, "fixed cost"))
    return Response(status_code=204)
