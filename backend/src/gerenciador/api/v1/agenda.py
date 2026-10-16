"""Read-only agenda of shoots."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query

from gerenciador.api.deps import Agenda
from gerenciador.api.v1.schemas import AgendaEntryOut

router = APIRouter(prefix="/agenda", tags=["agenda"])


@router.get("")
def get_agenda(
    service: Agenda,
    start: Annotated[dt.date, Query(alias="from")],
    end: Annotated[dt.date, Query(alias="to")],
) -> list[AgendaEntryOut]:
    return [AgendaEntryOut.from_entry(entry) for entry in service.between(start, end)]
