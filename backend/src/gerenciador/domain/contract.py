"""Contract rules and the wording of values printed in the contract."""

import datetime as dt
from collections.abc import Sequence

TO_BE_DEFINED = "A definir"

_MONTHS = (
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)
_NUMBER_WORDS = ("um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez")


class ContractRuleError(ValueError):
    """A contract broke a business rule. `field` is the request field at fault."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


def compute_total_cents(item_amounts: Sequence[int], discount_cents: int | None) -> int:
    if not item_amounts:
        raise ContractRuleError("payment.items", "informe ao menos um item")
    if any(amount <= 0 for amount in item_amounts):
        raise ContractRuleError("payment.items", "o valor de cada item deve ser maior que zero")
    subtotal = sum(item_amounts)
    if discount_cents is None:
        return subtotal
    if discount_cents <= 0 or discount_cents >= subtotal:
        raise ContractRuleError(
            "payment.pix_discount_cents",
            "o desconto deve ser maior que zero e menor que a soma dos itens",
        )
    return subtotal - discount_cents


def format_long_date(value: dt.date) -> str:
    return f"{value.day} de {_MONTHS[value.month - 1]} de {value.year}"


def format_time(value: dt.time | None) -> str:
    return TO_BE_DEFINED if value is None else value.strftime("%H:%M")


def format_hours(hours: int | None) -> str:
    if hours is None:
        return TO_BE_DEFINED
    return "1 hora" if hours == 1 else f"{hours} horas"


def text_or_to_be_defined(value: str | None) -> str:
    return TO_BE_DEFINED if value is None else value


def photographer_count_text(count: int) -> str:
    if not 1 <= count <= len(_NUMBER_WORDS):
        raise ValueError("photographer count must be between 1 and 10")
    return f"{count} ({_NUMBER_WORDS[count - 1]})"


def photographers_phrase(count: int) -> str:
    noun = "fotógrafo" if count == 1 else "fotógrafos"
    return f"{photographer_count_text(count)} {noun}"
