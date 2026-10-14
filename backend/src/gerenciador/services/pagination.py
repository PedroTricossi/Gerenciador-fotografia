"""Cursor pagination shared by list operations."""

import base64
import datetime as dt
from dataclasses import dataclass

from gerenciador.services.exceptions import InvalidCursorError


@dataclass(frozen=True)
class Page[T]:
    items: list[T]
    next_cursor: str | None


def encode_cursor(created_at: dt.datetime, row_id: str) -> str:
    raw = f"{created_at.isoformat()}|{row_id}".encode()
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_cursor(cursor: str) -> tuple[dt.datetime, str]:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        timestamp, _, row_id = decoded.partition("|")
        created_at = dt.datetime.fromisoformat(timestamp)
    except ValueError as exc:
        raise InvalidCursorError from exc
    if not row_id or created_at.tzinfo is None:
        raise InvalidCursorError
    return created_at, row_id
