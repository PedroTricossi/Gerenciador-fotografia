"""Fill the contract template and turn it into a printable HTML document."""

import re
from pathlib import Path
from typing import Any

from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment
from markdown_it import MarkdownIt

from gerenciador.config import Settings
from gerenciador.domain.contract import (
    format_hours,
    format_long_date,
    format_time,
    photographer_count_text,
    photographers_phrase,
    text_or_to_be_defined,
)
from gerenciador.domain.cpf import format_cpf
from gerenciador.domain.money import amount_in_words, format_brl
from gerenciador.services.contract_service import ContractView

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_WHITESPACE = re.compile(r"\s+")
_MD_PUNCTUATION = re.compile(r"([!-/:-@\[-`{-~])")

_CSS = """
@page {
  size: A4;
  margin: 2.5cm 2cm;
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; }
}
body {
  font-family: serif;
  font-size: 11pt;
  line-height: 1.4;
  text-align: justify;
  font-variant-ligatures: none;
}
h1 { font-size: 13pt; margin: 1.2em 0 0.6em; break-after: avoid; }
h1:first-of-type { text-align: center; }
h1:last-of-type { break-before: page; }
h3 { font-size: 11pt; margin: 1.6em 0 0.4em; break-after: avoid; }
hr { border: 0; margin: 0; }
ul { margin: 0.4em 0; }
"""

_HTML_SHELL = (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    "<title>Contrato</title><style>{css}</style></head><body>{body}</body></html>"
)


def escape_markdown(value: str) -> str:
    """Make a typed value inert: one line, with every Markdown character escaped."""
    flattened = _WHITESPACE.sub(" ", _CONTROL.sub(" ", value)).strip()
    return _MD_PUNCTUATION.sub(r"\\\1", flattened)


def _person_text(value: str | None) -> str:
    if value is None:
        raise ValueError("contract has an anonymised client and cannot be rendered")
    return escape_markdown(value)


def _person_cpf(digits: str | None) -> str:
    if digits is None:
        raise ValueError("contract has an anonymised client and cannot be rendered")
    return format_cpf(digits)


class ContractRenderer:
    def __init__(self, template_path: Path, settings: Settings) -> None:
        # The template is trusted. Typed values are escaped for Markdown below,
        # and raw HTML is disabled in the Markdown step.
        environment = SandboxedEnvironment(
            undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True
        )
        self._template = environment.from_string(template_path.read_text(encoding="utf-8"))
        self._markdown = MarkdownIt("commonmark", {"html": False})
        self._settings = settings

    def render_markdown(self, contract: ContractView) -> str:
        return self._template.render(self._context(contract))

    def render_html(self, contract: ContractView) -> str:
        body = self._markdown.render(self.render_markdown(contract))
        return _HTML_SHELL.format(css=_CSS, body=body)

    def _context(self, contract: ContractView) -> dict[str, Any]:
        settings = self._settings
        discount = contract.pix_discount_cents
        return {
            "contractor_name": escape_markdown(settings.contractor_name),
            "contractor_cpf": format_cpf(settings.contractor_cpf),
            "contractor_address": escape_markdown(settings.contractor_address),
            "contractor_representative": escape_markdown(settings.contractor_representative),
            "groom_name": _person_text(contract.groom.full_name),
            "groom_cpf": _person_cpf(contract.groom.cpf),
            "bride_name": _person_text(contract.bride.full_name),
            "bride_cpf": _person_cpf(contract.bride.cpf),
            "couple_address": _person_text(contract.couple_address),
            "event_date": format_long_date(contract.event_date),
            "venue_name": escape_markdown(contract.venue_name),
            "venue_address": escape_markdown(text_or_to_be_defined(contract.venue_address)),
            "coverage_start": format_time(contract.coverage_start),
            "coverage_end": format_time(contract.coverage_end),
            "hours_contracted": format_hours(contract.hours_contracted),
            "photographer_count": photographer_count_text(contract.photographer_count),
            "photographers": photographers_phrase(contract.photographer_count),
            "total_price": format_brl(contract.total_cents),
            "total_price_in_words": amount_in_words(contract.total_cents),
            "payment_items": [
                {
                    "amount": format_brl(item.amount_cents),
                    "description": escape_markdown(item.description),
                }
                for item in contract.items
            ],
            "pix_discount": None if discount is None else format_brl(discount),
            "signing_city": escape_markdown(contract.signing_city),
            "signing_date": format_long_date(contract.signing_date),
        }
