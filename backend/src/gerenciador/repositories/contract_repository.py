import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import Contract
from gerenciador.repositories.keyset import keyset_newest_first


class ContractRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, contract: Contract) -> None:
        self._session.add(contract)
        self._session.flush()

    def get(self, contract_id: str) -> Contract | None:
        return self._session.get(Contract, contract_id)

    def find_page(
        self, *, limit: int, before: tuple[dt.datetime, str] | None, include_deleted: bool
    ) -> list[Contract]:
        stmt = select(Contract)
        if not include_deleted:
            stmt = stmt.where(Contract.deleted_at.is_(None))
        stmt = keyset_newest_first(
            stmt, Contract.created_at, Contract.id, before=before, limit=limit
        )
        return list(self._session.scalars(stmt))
