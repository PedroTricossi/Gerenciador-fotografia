"""Brazilian real formatting. All amounts are integer centavos."""

from num2words import num2words


def _require_non_negative(cents: int) -> None:
    if cents < 0:
        raise ValueError("amount cannot be negative")


def format_brl(cents: int) -> str:
    _require_non_negative(cents)
    reais, centavos = divmod(cents, 100)
    grouped = f"{reais:,}".replace(",", ".")
    return f"R$ {grouped},{centavos:02d}"


def _cardinal(number: int) -> str:
    return str(num2words(number, lang="pt_BR"))


def _reais_in_words(reais: int) -> str:
    if reais == 1:
        return "um real"
    connector = " de" if reais >= 1_000_000 and reais % 1_000_000 == 0 else ""
    return f"{_cardinal(reais)}{connector} reais"


def amount_in_words(cents: int) -> str:
    _require_non_negative(cents)
    reais, centavos = divmod(cents, 100)
    parts: list[str] = []
    if reais or not centavos:
        parts.append(_reais_in_words(reais))
    if centavos:
        parts.append(f"{_cardinal(centavos)} {'centavo' if centavos == 1 else 'centavos'}")
    return " e ".join(parts)
