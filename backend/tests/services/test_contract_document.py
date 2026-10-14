import hashlib
import io
from collections.abc import Callable

import pytest
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent
from gerenciador.services import pdf_renderer
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService, pdf_filename
from gerenciador.services.contract_service import ContractInput, ContractService, PersonInput
from gerenciador.services.exceptions import ConflictError
from gerenciador.services.pdf_renderer import WeasyPrintRenderer

MakeInput = Callable[..., ContractInput]


def _pages(content: bytes) -> list[str]:
    """Text of each page with all whitespace removed, so line breaks do not matter."""
    return [
        "".join((page.extract_text() or "").split())
        for page in PdfReader(io.BytesIO(content)).pages
    ]


def test_generate_produces_the_contract_as_pdf(
    documents: ContractDocumentService,
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    created = contracts.create(ctx, make_input())
    pdf = documents.generate(ctx, created.id)

    assert pdf.content.startswith(b"%PDF")
    assert pdf.sha256 == hashlib.sha256(pdf.content).hexdigest()
    assert pdf.filename == "contrato-joao-maria-2027-03-14.pdf"

    pages = _pages(pdf.content)
    text = "".join(pages)
    for expected in (
        "CONTRATODEPRESTAÇÃODESERVIÇOSDEFOTOGRAFIADECASAMENTO",
        "JoãodaSilvaeMariaSouza",
        "123.456.789-09e987.654.321-00",
        "R$2.000,00(doismilreais)",
        "14demarçode2027",
        "Curitiba,13deoutubrode2026.",
    ):
        assert expected in text
    assert len(pages) >= 2
    assert "24.ASSINATURAS" in pages[-1]
    assert "23.DOFORO" not in pages[-1]

    event = session.scalars(select(AuditEvent).order_by(AuditEvent.id.desc())).first()
    assert event is not None
    assert event.action == "contract.pdf_generated"
    assert event.entity_id == created.id
    assert event.details == {"version": 1, "sha256": pdf.sha256}


def test_generate_is_refused_for_a_deleted_contract(
    documents: ContractDocumentService,
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    with pytest.raises(ConflictError):
        documents.generate(ctx, created.id)
    actions = list(session.scalars(select(AuditEvent.action)))
    assert "contract.pdf_generated" not in actions


def test_filename_is_ascii_and_safe(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    view = contracts.create(
        ctx,
        make_input(
            groom=PersonInput('José "Zé" d\'Ávila', "12345678909"),
            bride=PersonInput("Ângela/../x Souza", "98765432100"),
        ),
    )
    assert pdf_filename(view) == "contrato-jose-angelax-2027-03-14.pdf"


def test_renderer_fetches_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    requested: list[str] = []

    def _spy(url: str, *args: object, **kwargs: object) -> dict[str, object]:
        requested.append(url)
        raise ValueError("blocked")

    monkeypatch.setattr(pdf_renderer, "_deny_all", _spy)
    html = (
        '<html><head><link rel="stylesheet" href="http://example.invalid/x.css"></head>'
        '<body><img src="file:///etc/hosts"><p>ok</p></body></html>'
    )
    content = WeasyPrintRenderer().render(html)
    assert content.startswith(b"%PDF")
    assert "file:///etc/hosts" in requested
    assert "http://example.invalid/x.css" in requested


def test_deny_all_raises() -> None:
    with pytest.raises(ValueError, match="disabled"):
        pdf_renderer._deny_all("file:///etc/passwd")
