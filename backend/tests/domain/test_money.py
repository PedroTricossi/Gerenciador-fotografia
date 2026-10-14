from collections.abc import Callable

import pytest
from hypothesis import given
from hypothesis import strategies as st

from gerenciador.domain.money import amount_in_words, format_brl


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (0, "R$ 0,00"),
        (5, "R$ 0,05"),
        (50000, "R$ 500,00"),
        (120000, "R$ 1.200,00"),
        (200000, "R$ 2.000,00"),
        (123456789, "R$ 1.234.567,89"),
    ],
)
def test_format_brl(cents: int, expected: str) -> None:
    assert format_brl(cents) == expected


@given(cents=st.integers(0, 10**12))
def test_format_brl_round_trips(cents: int) -> None:
    text = format_brl(cents)
    assert text.startswith("R$ ")
    assert int(text[3:].replace(".", "").replace(",", "")) == cents


@pytest.mark.parametrize(
    ("cents", "expected"),
    [
        (0, "zero reais"),
        (1, "um centavo"),
        (50, "cinquenta centavos"),
        (100, "um real"),
        (150, "um real e cinquenta centavos"),
        (120000, "mil e duzentos reais"),
        (200000, "dois mil reais"),
        (230050, "dois mil e trezentos reais e cinquenta centavos"),
        (100000000, "um milhão de reais"),
        (200000000, "dois milhões de reais"),
    ],
)
def test_amount_in_words(cents: int, expected: str) -> None:
    assert amount_in_words(cents) == expected


@pytest.mark.parametrize("function", [format_brl, amount_in_words])
def test_negative_amounts_are_rejected(function: Callable[[int], str]) -> None:
    with pytest.raises(ValueError, match="negative"):
        function(-1)
