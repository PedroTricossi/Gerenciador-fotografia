"""Keyset pagination: newest first, with the row ID breaking ties."""

import datetime as dt

from sqlalchemy import Select, and_, or_
from sqlalchemy.orm import InstrumentedAttribute


def keyset_newest_first[T](
    stmt: Select[T],
    created_at: InstrumentedAttribute[dt.datetime],
    id_column: InstrumentedAttribute[str],
    *,
    before: tuple[dt.datetime, str] | None,
    limit: int,
) -> Select[T]:
    if before is not None:
        timestamp, last_id = before
        stmt = stmt.where(
            or_(created_at < timestamp, and_(created_at == timestamp, id_column < last_id))
        )
    return stmt.order_by(created_at.desc(), id_column.desc()).limit(limit)
