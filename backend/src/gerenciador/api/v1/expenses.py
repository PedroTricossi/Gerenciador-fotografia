from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response

from gerenciador.api.deps import Ctx, Expenses
from gerenciador.api.v1.schemas import ExpenseEventOut, ExpenseIn, ExpenseOut
from gerenciador.api.v1.versioning import expected_version
from gerenciador.services.expense_service import ExpenseView

router = APIRouter(tags=["expenses"])


def _respond(view: ExpenseView, response: Response) -> ExpenseOut:
    response.headers["ETag"] = f'"{view.version}"'
    return ExpenseOut.from_view(view)


@router.post("/expenses", status_code=201)
def create_expense(body: ExpenseIn, response: Response, ctx: Ctx, service: Expenses) -> ExpenseOut:
    view = service.create(ctx, body.to_input())
    response.headers["Location"] = f"/api/v1/expenses/{view.id}"
    return _respond(view, response)


@router.get("/expenses/{expense_id}")
def get_expense(expense_id: UUID, response: Response, service: Expenses) -> ExpenseOut:
    return _respond(service.get(str(expense_id)), response)


@router.patch("/expenses/{expense_id}")
def update_expense(
    expense_id: UUID,
    body: ExpenseIn,
    response: Response,
    ctx: Ctx,
    service: Expenses,
    if_match: Annotated[str | None, Header()] = None,
) -> ExpenseOut:
    version = expected_version(if_match, "expense")
    return _respond(service.update(ctx, str(expense_id), version, body.to_input()), response)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: UUID,
    ctx: Ctx,
    service: Expenses,
    if_match: Annotated[str | None, Header()] = None,
) -> Response:
    service.delete(ctx, str(expense_id), expected_version(if_match, "expense"))
    return Response(status_code=204)


@router.get("/expense-events")
def list_expense_events(service: Expenses) -> list[ExpenseEventOut]:
    return [ExpenseEventOut.from_view(choice) for choice in service.list_events()]
