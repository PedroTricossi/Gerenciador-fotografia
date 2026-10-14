import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from gerenciador.api.deps import Contracts, Ctx, Documents, Limit
from gerenciador.api.v1.schemas import ContractCreate, ContractOut, ContractPatch, PageOut
from gerenciador.services.contract_service import ContractView
from gerenciador.services.exceptions import StaleVersionError

router = APIRouter(prefix="/contracts", tags=["contracts"])


_STRONG_VERSION = re.compile(r'"([0-9]{1,18})"')


def _expected_version(if_match: str | None) -> int:
    """Read a strong `"<n>"` validator. Anything else cannot match any version."""
    if if_match is None:
        raise HTTPException(status_code=428, detail="If-Match header is required")
    match = _STRONG_VERSION.fullmatch(if_match.strip())
    if match is None:
        raise StaleVersionError
    return int(match.group(1))


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
    expected_version = _expected_version(if_match)
    try:
        view = service.patch(
            ctx, str(contract_id), expected_version, lambda view: body.apply_to(view).to_input()
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
