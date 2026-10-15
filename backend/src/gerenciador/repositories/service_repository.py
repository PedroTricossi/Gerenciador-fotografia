from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import Service


class ServiceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, service: Service) -> None:
        self._session.add(service)
        self._session.flush()

    def get(self, service_id: str) -> Service | None:
        return self._session.get(Service, service_id)

    def get_many(self, ids: Collection[str]) -> dict[str, Service]:
        if not ids:
            return {}
        rows = self._session.scalars(select(Service).where(Service.id.in_(ids)))
        return {row.id: row for row in rows}

    def all(self, *, include_archived: bool) -> list[Service]:
        stmt = select(Service)
        if not include_archived:
            stmt = stmt.where(Service.archived_at.is_(None))
        return list(self._session.scalars(stmt))
