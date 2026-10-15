from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from gerenciador.api.deps import Contracts, Ctx, Documents, Limit
from gerenciador.api.v1.schemas import ContractCreate, ContractOut, ContractPatch, PageOut
from gerenciador.api.v1.versioning import expected_version
from gerenciador.services.contract_service import ContractView

router = APIRouter(prefix="/contracts", tags=["contracts"])


def _respond(view: ContractView, response: Response) -> ContractOut:
    response.headers["ETag"] = f'"{view.version}"'
    return ContractOut.from_view(view, mask=False)


@router.post("", status_code=201)
def create_contract(
    body: ContractCreate, response: Response, ctx: Ctx, service: Contracts
) -> ContractOut:
    view = service.create(ctx, body.to_input())
    response.headers["Location"] = f"/api/v1/contracts/{view.id}"
    return _respond(view, response)


@router.get("")
def list_contracts(
    service: Contracts,
    limit: Limit = 20,
    cursor: str | None = None,
    include_deleted: bool = False,
) -> PageOut[ContractOut]:
    page = service.list_page(limit=limit, cursor=cursor, include_deleted=include_deleted)
    return PageOut(
        items=[ContractOut.from_view(view, mask=True) for view in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/{contract_id}")
def get_contract(contract_id: UUID, response: Response, service: Contracts) -> ContractOut:
    return _respond(service.get(str(contract_id)), response)


@router.patch("/{contract_id}")
def update_contract(
    contract_id: UUID,
    body: ContractPatch,
    response: Response,
    ctx: Ctx,
    service: Contracts,
    if_match: Annotated[str | None, Header()] = None,
) -> ContractOut:
    version = expected_version(if_match, "contract")
    try:
        view = service.patch(
            ctx, str(contract_id), version, lambda view: body.apply_to(view).to_input()
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc
    return _respond(view, response)


@router.delete("/{contract_id}", status_code=204)
def delete_contract(contract_id: UUID, ctx: Ctx, service: Contracts) -> None:
    service.delete(ctx, str(contract_id))


@router.post("/{contract_id}/restore")
def restore_contract(
    contract_id: UUID, response: Response, ctx: Ctx, service: Contracts
) -> ContractOut:
    return _respond(service.restore(ctx, str(contract_id)), response)


@router.get(
    "/{contract_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def contract_pdf(contract_id: UUID, ctx: Ctx, service: Documents) -> Response:
    pdf = service.generate(ctx, str(contract_id))
    return Response(
        content=pdf.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf.filename}"',
            "X-Content-SHA256": pdf.sha256,
        },
    )
