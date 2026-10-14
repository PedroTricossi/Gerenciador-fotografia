"""CPF validation and display."""

import re

_ALLOWED = re.compile(r"[\d.\-\s]*")
_NON_DIGITS = re.compile(r"\D")


def _check_digit(digits: str) -> int:
    weight = len(digits) + 1
    total = sum(int(digit) * (weight - index) for index, digit in enumerate(digits))
    remainder = (total * 10) % 11
    return 0 if remainder == 10 else remainder


def normalize_cpf(value: str) -> str:
    """Return the 11 digits of a valid CPF, or raise ValueError."""
    if not _ALLOWED.fullmatch(value):
        raise ValueError("CPF inválido")
    digits = _NON_DIGITS.sub("", value)
    if len(digits) != 11 or digits == digits[0] * 11:
        raise ValueError("CPF inválido")
    if _check_digit(digits[:9]) != int(digits[9]) or _check_digit(digits[:10]) != int(digits[10]):
        raise ValueError("CPF inválido")
    return digits


def format_cpf(digits: str) -> str:
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"


def mask_cpf(digits: str) -> str:
    return f"***.***.***-{digits[9:]}"
