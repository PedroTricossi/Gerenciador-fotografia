import datetime as dt
import re
from collections.abc import Callable
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.config import Settings
from gerenciador.db.models import Service
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_renderer import ContractRenderer, escape_markdown
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
    PersonInput,
)

MakeInput = Callable[..., ContractInput]


@pytest.fixture
def renderer(settings: Settings) -> ContractRenderer:
    return ContractRenderer(settings.template_path, settings)


def _html(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    data: ContractInput,
) -> str:
    return renderer.render_html(contracts.create(ctx, data))


def test_escape_markdown() -> None:
    assert escape_markdown("Rua A, 10 - Centro") == r"Rua A\, 10 \- Centro"
    assert escape_markdown("  a\n\nb\tc\x00d  ") == "a b c d"
    assert escape_markdown("*x* _y_ <b> [l](u) #") == r"\*x\* \_y\_ \<b\> \[l\]\(u\) \#"
    assert escape_markdown("João Água") == "João Água"


def test_markdown_fills_every_placeholder(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    markdown = renderer.render_markdown(contracts.create(ctx, make_input()))
    assert "{{" not in markdown
    assert "{%" not in markdown
    assert not re.search(r"^#\s*$", markdown, flags=re.MULTILINE)


def test_html_contains_the_parties(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert (
        "CONTRATADA: Fotografia Teste, inscrita no CPF sob nº 111.444.777-35, "
        "com endereço em Rua Exemplo 1 - Centro, neste ato representada por Pessoa Teste,"
    ) in html
    assert (
        "CONTRATANTES: João da Silva e Maria Souza, inscritos nos CPFs sob nº "
        "123.456.789-09 e 987.654.321-00, residentes e domiciliados em Rua das Flores 100,"
    ) in html
    assert "Nome: João da Silva" in html
    assert "Nome: Maria Souza" in html
    assert "CPF: 987.654.321-00" in html
    assert "Curitiba, 13 de outubro de 2026." in html


def test_html_contains_the_event_and_defaults(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert "Data do evento: 14 de março de 2027" in html
    assert "Local: Igreja Matriz" in html
    assert "Endereço: A definir" in html
    assert "Horário de início da cobertura: 16:00" in html
    assert "Horário previsto para término: A definir" in html
    assert "Quantidade de horas contratadas: A definir" in html
    assert "Quantidade de fotógrafos: 2 (dois)" in html
    assert "A cobertura será realizada por 2 (dois) fotógrafos, salvo" in html
    assert "A equipe será composta por 2 (dois) fotógrafos, salvo" in html


def test_html_contains_the_payment(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert "<strong>R$ 2.000,00 (dois mil reais)</strong>" in html
    assert "<li><strong>R$ 500,00</strong> - Diária segundo fotógrafo</li>" in html
    assert "<li><strong>R$ 1.200,00</strong> - Cobertura da cerimônia na igreja</li>" in html
    assert "aplica-se o desconto de <strong>R$ 300,00</strong>." in html


def test_discount_sentence_is_omitted_without_a_discount(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(renderer, contracts, ctx, make_input(pix_discount_cents=None))
    assert "aplica-se o desconto" not in html
    assert "<strong>R$ 2.300,00 (dois mil e trezentos reais)</strong>" in html


def test_optional_values_and_singular_photographer(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(
        renderer,
        contracts,
        ctx,
        make_input(
            venue_address="Praça Central 1",
            coverage_end=dt.time(23, 30),
            hours_contracted=7,
            photographer_count=1,
        ),
    )
    assert "Endereço: Praça Central 1" in html
    assert "Horário previsto para término: 23:30" in html
    assert "Quantidade de horas contratadas: 7 horas" in html
    assert "Quantidade de fotógrafos: 1 (um)" in html
    assert "A cobertura será realizada por 1 (um) fotógrafo, salvo" in html


def test_markdown_and_html_in_names_print_literally(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    hostile = "Ana *Lima* <b>x</b> [link](http://evil.example) # fim"
    html = _html(renderer, contracts, ctx, make_input(groom=PersonInput(hostile, "12345678909")))
    assert "Ana *Lima* &lt;b&gt;x&lt;/b&gt; [link](http://evil.example) # fim" in html
    assert "<em>" not in html
    assert "<a " not in html
    assert "<b>" not in html


def test_newlines_in_values_cannot_add_structure(
    renderer: ContractRenderer,
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    session.add(
        Service(
            id="5e7a1c00-0000-4000-8000-0000000000aa",
            name="Cobertura\n\n# Outro",
            default_price_cents=230000,
            is_prewedding=False,
            archived_at=None,
            version=1,
            created_at=utcnow(),
            updated_at=utcnow(),
        )
    )
    session.commit()
    baseline = _html(renderer, contracts, ctx, make_input())
    injected = _html(
        renderer,
        contracts,
        ctx,
        make_input(
            couple_address="Rua A\n\n# Injetado\n\n* item",
            items=[ItemInput("5e7a1c00-0000-4000-8000-0000000000aa", 230000)],
            pix_discount_cents=None,
        ),
    )
    assert injected.count("<h1") == baseline.count("<h1")
    assert "Rua A # Injetado * item" in injected


def test_template_syntax_in_values_is_not_evaluated(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(
        renderer,
        contracts,
        ctx,
        make_input(venue_name="{{ contractor_cpf }} {% for x in y %}"),
    )
    assert "Local: {{ contractor_cpf }} {% for x in y %}" in html


def test_html_document_shell_loads_no_external_resource(
    renderer: ContractRenderer,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    html = _html(renderer, contracts, ctx, make_input())
    assert html.startswith("<!doctype html>")
    assert '<html lang="pt-BR">' in html
    assert "<link" not in html
    assert "<script" not in html
    assert "src=" not in html
    assert not re.search(r"<h1>\s*</h1>", html)


def test_anonymised_client_cannot_be_rendered(
    renderer: ContractRenderer,
    contracts: ContractService,
    clients: ClientService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    clients.anonymise(ctx, created.groom.id)
    with pytest.raises(ValueError, match="anonymised"):
        renderer.render_html(contracts.get(created.id))


def test_missing_template_fails_at_construction(settings: Settings, tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        ContractRenderer(tmp_path / "missing.md", settings)
