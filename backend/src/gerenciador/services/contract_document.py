"""Generate the PDF of a stored contract and record that it was generated."""

import hashlib
import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy.orm import Session

from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.contract_service import ContractService, ContractView
from gerenciador.services.exceptions import ConflictError
from gerenciador.services.pdf_renderer import PdfRenderer

_NOT_SLUG = re.compile(r"[^a-z0-9]")


@dataclass(frozen=True)
class GeneratedPdf:
    content: bytes
    sha256: str
    filename: str


def _first_name_slug(full_name: str | None) -> str:
    words = (full_name or "").split()
    first = words[0] if words else ""
    ascii_only = unicodedata.normalize("NFKD", first).encode("ascii", "ignore").decode("ascii")
    return _NOT_SLUG.sub("", ascii_only.lower())


def pdf_filename(contract: ContractView) -> str:
    parts = [
        _first_name_slug(contract.groom.full_name),
        _first_name_slug(contract.bride.full_name),
        contract.event_date.isoformat(),
    ]
    return "contrato-" + "-".join(part for part in parts if part) + ".pdf"


class ContractDocumentService:
    def __init__(
        self,
        session: Session,
        contracts: ContractService,
        audit: AuditService,
        renderer: ContractRenderer,
        pdf: PdfRenderer,
    ) -> None:
        self._session = session
        self._contracts = contracts
        self._audit = audit
        self._renderer = renderer
        self._pdf = pdf

    def generate(self, ctx: RequestContext, contract_id: str) -> GeneratedPdf:
        contract = self._contracts.get(contract_id)
        if contract.deleted_at is not None:
            raise ConflictError("contract is deleted; restore it before generating the PDF")
        content = self._pdf.render(self._renderer.render_html(contract))
        digest = hashlib.sha256(content).hexdigest()
        self._audit.record(
            ctx,
            "contract.pdf_generated",
            entity_type="contract",
            entity_id=contract.id,
            details={"version": contract.version, "sha256": digest},
        )
        self._session.commit()
        return GeneratedPdf(content=content, sha256=digest, filename=pdf_filename(contract))
