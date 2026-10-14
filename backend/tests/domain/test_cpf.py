import pytest
from hypothesis import assume, given
from hypothesis import strategies as st

from gerenciador.domain.cpf import format_cpf, mask_cpf, normalize_cpf


def _reference_check_digit(digits: list[int]) -> int:
    total = 0
    weight = len(digits) + 1
    for digit in digits:
        total += digit * weight
        weight -= 1
    rest = total % 11
    return 0 if rest < 2 else 11 - rest


def _build_valid(base: list[int]) -> str:
    first = _reference_check_digit(base)
    second = _reference_check_digit([*base, first])
    return "".join(str(d) for d in [*base, first, second])


@pytest.mark.parametrize(
    ("raw", "digits"),
    [
        ("123.456.789-09", "12345678909"),
        ("12345678909", "12345678909"),
        (" 987.654.321-00 ", "98765432100"),
        ("111 444 777 35", "11144477735"),
    ],
)
def test_normalize_accepts_punctuated_and_bare(raw: str, digits: str) -> None:
    assert normalize_cpf(raw) == digits


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "123",
        "123.456.789-00",
        "111.111.111-11",
        "00000000000",
        "1234567890912",
        "abc12345678909",
        "123.456.789-09x",
        "123/456/789-09",
    ],
)
def test_normalize_rejects_invalid(raw: str) -> None:
    with pytest.raises(ValueError, match="CPF inválido"):
        normalize_cpf(raw)


@given(base=st.lists(st.integers(0, 9), min_size=9, max_size=9))
def test_generated_cpfs_are_accepted_and_a_wrong_last_digit_is_rejected(base: list[int]) -> None:
    cpf = _build_valid(base)
    assume(len(set(cpf)) > 1)
    assert normalize_cpf(cpf) == cpf
    assert normalize_cpf(format_cpf(cpf)) == cpf
    wrong_last = cpf[:10] + str((int(cpf[10]) + 1) % 10)
    with pytest.raises(ValueError, match="CPF inválido"):
        normalize_cpf(wrong_last)


def test_format_and_mask() -> None:
    assert format_cpf("12345678909") == "123.456.789-09"
    assert mask_cpf("12345678909") == "***.***.***-09"
