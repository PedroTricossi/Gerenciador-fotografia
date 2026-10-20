"""Pure rules for the business overview: periods, shares, and the transport price guide."""

import calendar
import datetime as dt
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal

from gerenciador.domain.instalments import Month, add_months

PALETTE_SIZE = 8
NIGHT_FROM = dt.time(18, 0)
MIN_TRIPS = 3
MAX_UPCOMING = 24
_MIN_UPCOMING = 3
_SIMILAR_MIN_TENTHS = 150  # 15 km
_MONTH_RE = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")
_YEAR_RE = re.compile(r"[0-9]{4}")


def period_bounds(period: Literal["month", "year"], value: str) -> tuple[dt.date, dt.date]:
    """First and last day (inclusive) of a `YYYY-MM` month or a `YYYY` year."""
    if period == "month" and _MONTH_RE.fullmatch(value):
        year, mon = int(value[:4]), int(value[5:7])
        return dt.date(year, mon, 1), dt.date(year, mon, calendar.monthrange(year, mon)[1])
    if period == "year" and _YEAR_RE.fullmatch(value):
        year = int(value)
        return dt.date(year, 1, 1), dt.date(year, 12, 31)
    raise ValueError(f"invalid {period}: {value!r}")


def upcoming_months(current: Month, last_due: Month | None) -> list[Month]:
    """The months after `current`: at least 3, through `last_due`, at most 24."""
    count = _MIN_UPCOMING
    if last_due is not None:
        ahead = (int(last_due[:4]) - int(current[:4])) * 12 + int(last_due[5:7]) - int(current[5:7])
        count = max(count, ahead)
    return [add_months(current, i) for i in range(1, min(count, MAX_UPCOMING) + 1)]


def palette_slots(type_ids_in_creation_order: Sequence[str]) -> dict[str, int | None]:
    """Colour slot per expense type; types beyond the palette get `None`."""
    return {
        type_id: (i if i < PALETTE_SIZE else None)
        for i, type_id in enumerate(type_ids_in_creation_order)
    }


def _half_up_div(numerator: int, denominator: int) -> int:
    return (2 * numerator + denominator) // (2 * denominator)


def share_tenths(part: int, whole: int) -> int | None:
    """Percent x 10, rounded half-up; `None` when it makes no sense."""
    if whole <= 0 or part > whole:
        return None
    return _half_up_div(part * 1000, whole)


def median_cents(values: Sequence[int]) -> int:
    """Median in centavos, rounded half-up."""
    if not values:
        raise ValueError("median of no values")
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return _half_up_div(ordered[mid - 1] + ordered[mid], 2)


@dataclass(frozen=True)
class Leg:
    contract_id: str
    event_kind: str
    spent_on: dt.date
    amount_cents: int
    distance_tenths: int | None
    left_home_at: dt.time | None
    transport_kind: str | None


@dataclass(frozen=True)
class Trip:
    contract_id: str
    event_kind: str
    date: dt.date
    cost_cents: int
    distance_tenths: int
    left_home_at: dt.time | None
    transport_kind: str | None


def group_trips(legs: Iterable[Leg]) -> list[Trip]:
    """One trip per (contract, event kind): costs summed, longest distance, earliest departure."""
    groups: dict[tuple[str, str], list[Leg]] = defaultdict(list)
    for leg in legs:
        groups[(leg.contract_id, leg.event_kind)].append(leg)
    trips = []
    for (contract_id, event_kind), group in groups.items():
        group.sort(key=lambda leg: leg.spent_on)
        distances = [g.distance_tenths for g in group if g.distance_tenths is not None]
        if not distances:
            continue
        timed = [g for g in group if g.left_home_at is not None]
        # The earliest departure sets the time and the kind; with no times, the first leg's kind.
        first = min(timed, key=lambda g: g.left_home_at or NIGHT_FROM) if timed else group[0]
        trips.append(
            Trip(
                contract_id,
                event_kind,
                group[0].spent_on,
                sum(g.amount_cents for g in group),
                max(distances),
                first.left_home_at,
                first.transport_kind,
            )
        )
    return trips


@dataclass(frozen=True)
class GuideResult:
    trips_total: int
    similar: list[Trip]
    typical_cents: int | None
    min_cents: int | None
    max_cents: int | None
    per_km_by_kind: dict[str, int]
    day_per_km: int | None
    night_per_km: int | None


def _per_km(trip: Trip) -> int:
    return _half_up_div(trip.cost_cents * 10, trip.distance_tenths)


def _is_night(at: dt.time) -> bool:
    return at >= NIGHT_FROM


def guide(
    trips: Sequence[Trip], distance_tenths: int | None, left_home_at: dt.time | None
) -> GuideResult:
    similar: list[Trip] = []
    if distance_tenths is not None:
        window = max(_SIMILAR_MIN_TENTHS, -(-distance_tenths // 4))
        similar = [t for t in trips if abs(t.distance_tenths - distance_tenths) <= window]
        similar.sort(
            key=lambda t: (
                0
                if left_home_at is not None
                and t.left_home_at is not None
                and _is_night(t.left_home_at) == _is_night(left_home_at)
                else 1,
                abs(t.distance_tenths - distance_tenths),
                -t.date.toordinal(),
            )
        )

    typical = low = high = None
    if len(similar) >= MIN_TRIPS:
        costs = [t.cost_cents for t in similar]
        typical, low, high = median_cents(costs), min(costs), max(costs)

    by_kind: dict[str, list[int]] = defaultdict(list)
    day: list[int] = []
    night: list[int] = []
    for t in trips:
        if t.transport_kind is not None:
            by_kind[t.transport_kind].append(_per_km(t))
        if t.left_home_at is not None:
            (night if _is_night(t.left_home_at) else day).append(_per_km(t))

    both_sides = len(day) >= MIN_TRIPS and len(night) >= MIN_TRIPS
    return GuideResult(
        trips_total=len(trips),
        similar=similar,
        typical_cents=typical,
        min_cents=low,
        max_cents=high,
        per_km_by_kind={k: median_cents(v) for k, v in by_kind.items() if len(v) >= MIN_TRIPS},
        day_per_km=median_cents(day) if both_sides else None,
        night_per_km=median_cents(night) if both_sides else None,
    )
