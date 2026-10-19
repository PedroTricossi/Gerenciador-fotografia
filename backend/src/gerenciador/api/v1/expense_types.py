from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response

from gerenciador.api.deps import Ctx, ExpenseTypes
from gerenciador.api.v1.schemas import ExpenseTypeIn, ExpenseTypeOut, ExpenseTypePatch
from gerenciador.api.v1.versioning import expected_version
from gerenciador.services.expense_type_service import ExpenseTypeView

router = APIRouter(prefix="/expense-types", tags=["expense-types"])


def _respond(view: ExpenseTypeView, response: Response) -> ExpenseTypeOut:
    response.headers["ETag"] = f'"{view.version}"'
    return ExpenseTypeOut.from_view(view)


@router.get("")
def list_expense_types(
    service: ExpenseTypes, include_archived: bool = False
) -> list[ExpenseTypeOut]:
    return [
        ExpenseTypeOut.from_view(view)
        for view in service.list_types(include_archived=include_archived)
    ]


@router.post("", status_code=201)
def create_expense_type(
    body: ExpenseTypeIn, response: Response, ctx: Ctx, service: ExpenseTypes
) -> ExpenseTypeOut:
    view = service.create(ctx, body.name)
    response.headers["Location"] = f"/api/v1/expense-types/{view.id}"
    return _respond(view, response)


@router.get("/{type_id}")
def get_expense_type(type_id: UUID, response: Response, service: ExpenseTypes) -> ExpenseTypeOut:
    return _respond(service.get(str(type_id)), response)


@router.patch("/{type_id}")
def rename_expense_type(
    type_id: UUID,
    body: ExpenseTypePatch,
    response: Response,
    ctx: Ctx,
    service: ExpenseTypes,
    if_match: Annotated[str | None, Header()] = None,
) -> ExpenseTypeOut:
    version = expected_version(if_match, "expense type")
    return _respond(service.rename(ctx, str(type_id), version, body.name), response)


@router.post("/{type_id}/archive")
def archive_expense_type(
    type_id: UUID, response: Response, ctx: Ctx, service: ExpenseTypes
) -> ExpenseTypeOut:
    return _respond(service.archive(ctx, str(type_id)), response)


@router.post("/{type_id}/restore")
def restore_expense_type(
    type_id: UUID, response: Response, ctx: Ctx, service: ExpenseTypes
) -> ExpenseTypeOut:
    return _respond(service.restore(ctx, str(type_id)), response)
