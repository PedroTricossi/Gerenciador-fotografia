import datetime as dt

import pytest

from gerenciador.domain.expenses import (
    MAX_RANGE_MONTHS,
    fee_amount,
    fixed_cost_occurrences,
    months_in,
    occurrence_date,
    price_in_force,
)


@pytest.mark.parametrize(
    ("month", "day", "expected"),
    [
        ("2026-02", 31, dt.date(2026, 2, 28)),
        ("2028-02", 31, dt.date(2028, 2, 29)),
        ("2026-04", 31, dt.date(2026, 4, 30)),
        ("2026-10", 3, dt.date(2026, 10, 3)),
    ],
)
def test_occurrence_date_clamps_to_the_last_day(month: str, day: int, expected: dt.date) -> None:
    assert occurrence_date(month, day) == expected


def test_months_in_is_inclusive_across_years() -> None:
    assert months_in("2026-11", "2027-02") == ["2026-11", "2026-12", "2027-01", "2027-02"]


def test_months_in_rejects_a_reversed_range() -> None:
    with pytest.raises(ValueError):
        months_in("2026-10", "2026-09")


def test_months_in_allows_24_months_but_not_25() -> None:
    assert len(months_in("2026-01", "2027-12")) == MAX_RANGE_MONTHS
    with pytest.raises(ValueError):
        months_in("2026-01", "2028-01")


@pytest.mark.parametrize(
    ("month", "expected"),
    [("2025-12", None), ("2026-09", 12400), ("2026-10", 13900), ("2027-03", 13900)],
)
def test_price_in_force_uses_the_latest_from_month(month: str, expected: int | None) -> None:
    history = [("2026-10", 13900), ("2026-01", 12400)]
    assert price_in_force(history, month) == expected


def test_fixed_cost_occurrences_stay_within_start_and_end() -> None:
    months = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
    result = fixed_cost_occurrences("2026-09", "2026-11", 31, [("2026-09", 5000)], months)
    assert result == [
        ("2026-09", dt.date(2026, 9, 30), 5000),
        ("2026-10", dt.date(2026, 10, 31), 5000),
        ("2026-11", dt.date(2026, 11, 30), 5000),
    ]


def test_fixed_cost_without_end_runs_on() -> None:
    result = fixed_cost_occurrences("2026-09", None, 5, [("2026-09", 5000)], ["2026-09", "2030-01"])
    assert [m for m, _, _ in result] == ["2026-09", "2030-01"]


def test_backdated_price_applies_from_its_month() -> None:
    months = ["2026-05", "2026-06", "2026-07", "2026-08"]
    history = [("2026-05", 5000), ("2026-07", 6000)]
    result = fixed_cost_occurrences("2026-05", None, 10, history, months)
    assert [a for _, _, a in result] == [5000, 5000, 6000, 6000]


def test_months_without_a_price_are_skipped() -> None:
    assert fixed_cost_occurrences(
        "2026-05", None, 10, [("2026-07", 6000)], ["2026-06", "2026-07"]
    ) == [("2026-07", dt.date(2026, 7, 10), 6000)]


def test_fee_amount_prefers_the_override_then_the_standard() -> None:
    standard = [("2026-06", 50000)]
    assert fee_amount(standard, None, "2026-05") is None
    assert fee_amount(standard, None, "2026-06") == 50000
    assert fee_amount(standard, 70000, "2026-05") == 70000
