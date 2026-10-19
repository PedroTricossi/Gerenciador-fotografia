"""Pure rules for contract payment plans (1 to 4 monthly instalments)."""

import calendar
import datetime as dt
import re
from collections.abc import Sequence

from gerenciador.domain.contract import ContractRuleError

MAX_INSTALMENTS = 4
Month = str  # "YYYY-MM"

_MONTH_RE = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")


def month_of(day: dt.date) -> Month:
    return f"{day.year:04d}-{day.month:02d}"


def add_months(month: Month, n: int) -> Month:
    year, mon = int(month[:4]), int(month[5:7])
    index = year * 12 + (mon - 1) + n
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def split_equally(total_cents: int, count: int) -> list[int]:
    """`floor(total / count)` each, leftover centavos on the last one."""
    base = total_cents // count
    amounts = [base] * count
    amounts[-1] += total_cents - base * count
    return amounts


def spread_change(amounts: Sequence[int], paid: Sequence[bool], new_total: int) -> list[int]:
    """Add the total's difference equally to the unpaid instalments, so custom shapes survive.

    `floor(diff / k)` each (Python `//` floors negatives, like the frontend's `Math.floor`),
    with the leftover on the last unpaid one.
    """
    result = list(amounts)
    diff = new_total - sum(amounts)
    if diff == 0:
        return result
    unpaid = [i for i, is_paid in enumerate(paid) if not is_paid]
    if not unpaid:
        raise ContractRuleError("instalments", "todas as parcelas estão pagas; ajuste o plano")
    for index, delta in zip(unpaid, split_equally(diff, len(unpaid)), strict=True):
        result[index] += delta
    if min(result[i] for i in unpaid) <= 0:
        raise ContractRuleError(
            "instalments",
            "a mudança de valor deixaria uma parcela sem valor; ajuste o plano",
        )
    return result


def validate_plan(months: Sequence[str], amounts: Sequence[int], total_cents: int) -> None:
    if not 1 <= len(amounts) <= MAX_INSTALMENTS or len(months) != len(amounts):
        raise ContractRuleError("instalments", "o plano deve ter de 1 a 4 parcelas")
    for i, month in enumerate(months):
        if not _MONTH_RE.fullmatch(month):
            raise ContractRuleError(f"instalments.{i}.month", "mês inválido")
        if i > 0 and month <= months[i - 1]:
            raise ContractRuleError(
                f"instalments.{i}.month", "os meses das parcelas devem ser crescentes"
            )
    for i, amount in enumerate(amounts):
        if amount <= 0:
            raise ContractRuleError(
                f"instalments.{i}.amount_cents", "o valor de cada parcela deve ser maior que zero"
            )
    if sum(amounts) != total_cents:
        raise ContractRuleError("instalments", "a soma das parcelas deve ser igual ao total")


def in_reminder_window(today: dt.date) -> bool:
    """True from the month's last day minus 6 through its last day."""
    last_day = calendar.monthrange(today.year, today.month)[1]
    return today.day > last_day - 7
