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
    """Spread a total change equally over the unpaid instalments."""
    result = list(amounts)
    if new_total == sum(amounts):
        return result
    unpaid = [i for i, is_paid in enumerate(paid) if not is_paid]
    if not unpaid:
        raise ContractRuleError("instalments", "todas as parcelas estão pagas; ajuste o plano")
    paid_sum = sum(a for a, is_paid in zip(amounts, paid, strict=True) if is_paid)
    shares = split_equally(new_total - paid_sum, len(unpaid))
    if min(shares) <= 0:
        raise ContractRuleError(
            "instalments",
            "a mudança de valor deixaria uma parcela sem valor; ajuste o plano",
        )
    for index, share in zip(unpaid, shares, strict=True):
        result[index] = share
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
