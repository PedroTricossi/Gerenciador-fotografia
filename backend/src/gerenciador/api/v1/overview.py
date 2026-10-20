"""The business overview: money in and out of a period and the months ahead."""

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from gerenciador.api.deps import Overview
from gerenciador.api.v1.schemas import OverviewOut

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("")
def overview(
    service: Overview,
    period: Annotated[Literal["month", "year"], Query()],
    value: Annotated[str, Query()],
    today: Annotated[dt.date, Query()],
) -> OverviewOut:
    return OverviewOut.from_view(service.overview(period, value, today))
