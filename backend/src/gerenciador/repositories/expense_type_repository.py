from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import ExpenseType


class ExpenseTypeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, expense_type: ExpenseType) -> None:
        self._session.add(expense_type)
        self._session.flush()

    def get(self, type_id: str) -> ExpenseType | None:
        return self._session.get(ExpenseType, type_id)

    def all(self, *, include_archived: bool) -> list[ExpenseType]:
        stmt = select(ExpenseType)
        if not include_archived:
            stmt = stmt.where(ExpenseType.archived_at.is_(None))
        return list(self._session.scalars(stmt))
