import datetime as dt

import pytest

from gerenciador.domain.contract import (
    TO_BE_DEFINED,
    ContractRuleError,
    compute_total_cents,
    format_hours,
    format_long_date,
    format_time,
    photographer_count_text,
    photographers_phrase,
    text_or_to_be_defined,
)


def test_total_is_items_minus_discount() -> None:
    assert compute_total_cents([50000, 120000, 60000], 30000) == 200000
    assert compute_total_cents([120000], None) == 120000


@pytest.mark.parametrize(
    ("items", "discount", "field"),
    [
        ([], None, "payment.items"),
        ([0], None, "payment.items"),
        ([100, -5], None, "payment.items"),
        ([1000], 0, "payment.pix_discount_cents"),
        ([1000], 1000, "payment.pix_discount_cents"),
        ([1000], 2000, "payment.pix_discount_cents"),
    ],
)
def test_total_rules(items: list[int], discount: int | None, field: str) -> None:
    with pytest.raises(ContractRuleError) as error:
        compute_total_cents(items, discount)
    assert error.value.field == field
    assert error.value.message


def test_dates_times_and_hours() -> None:
    assert format_long_date(dt.date(2027, 3, 14)) == "14 de março de 2027"
    assert format_long_date(dt.date(2026, 12, 1)) == "1 de dezembro de 2026"
    assert format_time(dt.time(16, 0)) == "16:00"
    assert format_time(None) == TO_BE_DEFINED
    assert format_hours(1) == "1 hora"
    assert format_hours(6) == "6 horas"
    assert format_hours(None) == TO_BE_DEFINED


def test_text_or_to_be_defined() -> None:
    assert text_or_to_be_defined("Rua A") == "Rua A"
    assert text_or_to_be_defined(None) == "A definir"


def test_photographer_wording() -> None:
    assert photographer_count_text(2) == "2 (dois)"
    assert photographers_phrase(2) == "2 (dois) fotógrafos"
    assert photographers_phrase(1) == "1 (um) fotógrafo"
    assert photographers_phrase(10) == "10 (dez) fotógrafos"


@pytest.mark.parametrize("count", [0, 11])
def test_photographer_count_out_of_range(count: int) -> None:
    with pytest.raises(ValueError, match="between 1 and 10"):
        photographer_count_text(count)
