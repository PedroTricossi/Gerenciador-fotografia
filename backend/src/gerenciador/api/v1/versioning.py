"""Reading the If-Match header that guards edits."""

import re

from fastapi import HTTPException

from gerenciador.services.exceptions import StaleVersionError

_STRONG_VERSION = re.compile(r'"([0-9]{1,18})"')


def expected_version(if_match: str | None, entity: str) -> int:
    """Read a strong `"<n>"` validator. Anything else cannot match any version."""
    if if_match is None:
        raise HTTPException(status_code=428, detail="If-Match header is required")
    match = _STRONG_VERSION.fullmatch(if_match.strip())
    if match is None:
        raise StaleVersionError(entity)
    return int(match.group(1))
