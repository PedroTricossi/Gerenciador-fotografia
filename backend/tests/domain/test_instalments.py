import datetime as dt

import pytest

from gerenciador.domain.contract import ContractRuleError
from gerenciador.domain.instalments import (
    MAX_INSTALMENTS,
    add_months,
    in_reminder_window,
    month_of,
    split_equally,
    spread_change,
    validate_plan,
)


def test_max_instalments_is_four() -> None:
    assert MAX_INSTALMENTS == 4


@pytest.mark.parametrize(
    ("total", "count", "expected"),
    [
        (1000, 3, [333, 333, 334]),
        (396000, 4, [99000] * 4),
        (5, 1, [5]),
    ],
)
def test_split_equally(total: int, count: int, expected: list[int]) -> None:
    result = split_equally(total, count)
    assert result == expected
    assert sum(result) == total


def test_spread_change_increase_goes_to_unpaid() -> None:
    assert spread_change([1400, 1400, 1400], [True, False, False], 4800) == [1400, 1700, 1700]


def test_spread_change_decrease() -> None:
    assert spread_change([1000, 1000], [True, False], 1500) == [1000, 500]


def test_spread_change_leftover_goes_to_last_unpaid() -> None:
    assert spread_change([100, 100, 100], [False, False, True], 301) == [100, 101, 100]


def test_spread_change_unchanged_total_with_all_paid_is_a_no_op() -> None:
    assert spread_change([100, 200], [True, True], 300) == [100, 200]


def test_spread_change_all_paid_and_total_changed_raises() -> None:
    with pytest.raises(ContractRuleError) as exc:
        spread_change([100, 200], [True, True], 400)
    assert exc.value.field == "instalments"
    assert exc.value.message == "todas as parcelas estão pagas; ajuste o plano"


def test_spread_change_that_zeroes_an_unpaid_amount_raises() -> None:
    with pytest.raises(ContractRuleError) as exc:
        spread_change([1000, 1000], [True, False], 1000)
    assert exc.value.field == "instalments"
    assert exc.value.message == "a mudança de valor deixaria uma parcela sem valor; ajuste o plano"


def test_month_arithmetic() -> None:
    assert add_months("2026-12", 1) == "2027-01"
    assert add_months("2027-01", -1) == "2026-12"
    assert add_months("2026-10", 0) == "2026-10"
    assert month_of(dt.date(2026, 10, 17)) == "2026-10"


def test_validate_plan_accepts_a_good_plan() -> None:
    validate_plan(["2026-10", "2026-12"], [500, 500], 1000)


def test_validate_plan_rejects_no_instalments() -> None:
    with pytest.raises(ContractRuleError) as exc:
        validate_plan([], [], 1000)
    assert exc.value.field == "instalments"
    assert exc.value.message == "o plano deve ter de 1 a 4 parcelas"


def test_validate_plan_rejects_five_instalments() -> None:
    months = [f"2026-{m:02d}" for m in range(1, 6)]
    with pytest.raises(ContractRuleError) as exc:
        validate_plan(months, [200] * 5, 1000)
    assert exc.value.field == "instalments"


def test_validate_plan_rejects_a_wrong_sum() -> None:
    with pytest.raises(ContractRuleError) as exc:
        validate_plan(["2026-10", "2026-11"], [500, 400], 1000)
    assert exc.value.field == "instalments"
    assert exc.value.message == "a soma das parcelas deve ser igual ao total"


@pytest.mark.parametrize("months", [["2026-11", "2026-10"], ["2026-10", "2026-10"]])
def test_validate_plan_rejects_months_not_strictly_increasing(months: list[str]) -> None:
    with pytest.raises(ContractRuleError) as exc:
        validate_plan(months, [500, 500], 1000)
    assert exc.value.field == "instalments.1.month"
    assert exc.value.message == "os meses das parcelas devem ser crescentes"


@pytest.mark.parametrize("amount", [0, -100])
def test_validate_plan_rejects_a_non_positive_amount(amount: int) -> None:
    with pytest.raises(ContractRuleError) as exc:
        validate_plan(["2026-10", "2026-11"], [1000 - amount, amount], 1000)
    assert exc.value.field == "instalments.1.amount_cents"
    assert exc.value.message == "o valor de cada parcela deve ser maior que zero"


@pytest.mark.parametrize("bad", ["2026-13", "26-10", "2026-00", "2026-1", "abcd-ef"])
def test_validate_plan_rejects_a_malformed_month(bad: str) -> None:
    with pytest.raises(ContractRuleError) as exc:
        validate_plan(["2026-09", bad], [500, 500], 1000)
    assert exc.value.field == "instalments.1.month"
    assert exc.value.message == "mês inválido"


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (dt.date(2026, 10, 24), False),
        (dt.date(2026, 10, 25), True),
        (dt.date(2026, 10, 31), True),
        (dt.date(2027, 2, 21), False),
        (dt.date(2027, 2, 22), True),
        (dt.date(2028, 2, 22), False),
        (dt.date(2028, 2, 23), True),
    ],
)
def test_in_reminder_window(day: dt.date, expected: bool) -> None:
    assert in_reminder_window(day) is expected
