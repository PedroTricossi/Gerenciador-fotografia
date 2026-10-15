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
def get_prewedding(contract_id: UUID, response: Response, service: Preweddings) -> PreweddingOut:
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
