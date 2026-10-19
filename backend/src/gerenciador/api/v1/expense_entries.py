"""The merged list of expenses for a range of months."""

from typing import Annotated

from fastapi import APIRouter, Query

from gerenciador.api.deps import ExpenseEntries
from gerenciador.api.v1.schemas import ExpenseEntriesOut

router = APIRouter(prefix="/expense-entries", tags=["expense-entries"])


@router.get("")
def expense_entries(
    service: ExpenseEntries,
    from_month: Annotated[str, Query(alias="from", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")],
    to_month: Annotated[str, Query(alias="to", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")],
) -> ExpenseEntriesOut:
    return ExpenseEntriesOut.from_entries(service.entries(from_month, to_month))
