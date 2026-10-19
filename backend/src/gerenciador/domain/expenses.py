"""Pure rules for expenses: fixed-cost occurrences and the second-photographer fee."""

import calendar
import datetime as dt
from collections.abc import Sequence

from gerenciador.domain.instalments import Month, add_months

MAX_RANGE_MONTHS = 24
PriceHistory = Sequence[tuple[Month, int]]  # (from_month, amount_cents), in any order


def months_in(from_month: Month, to_month: Month) -> list[Month]:
    """Every month from `from_month` to `to_month`, inclusive."""
    if from_month > to_month:
        raise ValueError("from must not be after to")
    result = [from_month]
    while result[-1] < to_month:
        if len(result) >= MAX_RANGE_MONTHS:
            raise ValueError(f"range exceeds {MAX_RANGE_MONTHS} months")
        result.append(add_months(result[-1], 1))
    return result


def occurrence_date(month: Month, day: int) -> dt.date:
    """The given day of the month, clamped to the month's last day."""
    year, mon = int(month[:4]), int(month[5:7])
    return dt.date(year, mon, min(day, calendar.monthrange(year, mon)[1]))


def price_in_force(history: PriceHistory, month: Month) -> int | None:
    """The amount of the latest entry whose from_month is at or before `month`."""
    applicable = [entry for entry in history if entry[0] <= month]
    return max(applicable)[1] if applicable else None


def fixed_cost_occurrences(
    start_month: Month,
    end_month: Month | None,
    day: int,
    history: PriceHistory,
    months: Sequence[Month],
) -> list[tuple[Month, dt.date, int]]:
    """(month, date, amount) for each listed month in start..end with a price in force."""
    result: list[tuple[Month, dt.date, int]] = []
    for month in months:
        if month < start_month or (end_month is not None and month > end_month):
            continue
        amount = price_in_force(history, month)
        if amount is not None:
            result.append((month, occurrence_date(month, day), amount))
    return result


def fee_amount(standard: PriceHistory, override: int | None, month: Month) -> int | None:
    """The override if there is one, otherwise the standard fee in force that month."""
    return override if override is not None else price_in_force(standard, month)
