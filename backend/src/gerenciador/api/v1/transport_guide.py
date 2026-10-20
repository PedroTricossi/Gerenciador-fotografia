"""The transport price guide, built from the trips already recorded."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query

from gerenciador.api.deps import TransportGuide
from gerenciador.api.v1.schemas import TransportGuideOut

router = APIRouter(prefix="/transport-guide", tags=["transport-guide"])


@router.get("")
def transport_guide(
    service: TransportGuide,
    today: Annotated[dt.date, Query()],
    distance_tenths: Annotated[int | None, Query(ge=1, le=50000)] = None,
    left_home_at: Annotated[dt.time | None, Query()] = None,
) -> TransportGuideOut:
    return TransportGuideOut.from_view(service.guide(today, distance_tenths, left_home_at))
