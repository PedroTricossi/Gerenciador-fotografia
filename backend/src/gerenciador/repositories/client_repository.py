import datetime as dt

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from gerenciador.db.models import Client, Contract
from gerenciador.repositories.keyset import keyset_newest_first


class ClientRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, client: Client) -> None:
        self._session.add(client)
        self._session.flush()

    def get(self, client_id: str) -> Client | None:
        return self._session.get(Client, client_id)

    def get_by_cpf_lookup(self, lookup: str) -> Client | None:
        return self._session.scalars(
            select(Client).where(Client.cpf_lookup == lookup)
        ).one_or_none()

    def find_page(self, *, limit: int, before: tuple[dt.datetime, str] | None) -> list[Client]:
        stmt = keyset_newest_first(
            select(Client), Client.created_at, Client.id, before=before, limit=limit
        )
        return list(self._session.scalars(stmt))

    def contracts_of(self, client_id: str) -> list[Contract]:
        stmt = (
            select(Contract)
            .where(or_(Contract.groom_id == client_id, Contract.bride_id == client_id))
            .order_by(Contract.created_at)
        )
        return list(self._session.scalars(stmt))
