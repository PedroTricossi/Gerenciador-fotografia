import datetime as dt
from collections.abc import Callable, Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from gerenciador.config import Settings, generate_key
from gerenciador.db.migrate import init_database
from gerenciador.db.session import create_session_factory
from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
    PersonInput,
)
from gerenciador.services.crypto import FieldCipher
from gerenciador.services.pdf_renderer import WeasyPrintRenderer


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        contractor_name="Fotografia Teste",
        contractor_cpf="111.444.777-35",
        contractor_address="Rua Exemplo 1 - Centro",
        contractor_representative="Pessoa Teste",
        field_encryption_key=generate_key(),
        cpf_lookup_key=generate_key(),
        database_path=tmp_path / "data" / "test.db",
        frontend_dist=tmp_path / "no-frontend",
        host="127.0.0.1",
        port=8000,
    )


@pytest.fixture
def cipher(settings: Settings) -> FieldCipher:
    return FieldCipher.from_settings(settings)


@pytest.fixture
def engine(settings: Settings) -> Iterator[Engine]:
    db_engine = init_database(settings.database_path)
    yield db_engine
    db_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with create_session_factory(engine)() as db_session:
        yield db_session


@pytest.fixture
def ctx() -> RequestContext:
    return RequestContext(actor="owner", request_id="test-request")


@pytest.fixture
def audit(session: Session) -> AuditService:
    return AuditService(session)


@pytest.fixture
def clients(session: Session, cipher: FieldCipher, audit: AuditService) -> ClientService:
    return ClientService(session, cipher, audit)


@pytest.fixture
def contracts(session: Session, clients: ClientService, audit: AuditService) -> ContractService:
    return ContractService(session, clients, audit)


@pytest.fixture
def make_input() -> Callable[..., ContractInput]:
    def _make(**overrides: Any) -> ContractInput:
        base = ContractInput(
            groom=PersonInput(full_name="João da Silva", cpf="12345678909"),
            bride=PersonInput(full_name="Maria Souza", cpf="98765432100"),
            couple_address="Rua das Flores 100",
            event_date=dt.date(2027, 3, 14),
            venue_name="Igreja Matriz",
            venue_address=None,
            coverage_start=dt.time(16, 0),
            coverage_end=None,
            hours_contracted=None,
            photographer_count=2,
            items=[
                ItemInput("Diária segundo fotógrafo", 50000),
                ItemInput("Cobertura da cerimônia na igreja", 120000),
                ItemInput("Cobertura das fotos protocolares e jantar", 60000),
            ],
            pix_discount_cents=30000,
            signing_city="Curitiba",
            signing_date=dt.date(2026, 10, 13),
        )
        return replace(base, **overrides)

    return _make


@pytest.fixture
def documents(
    session: Session, contracts: ContractService, audit: AuditService, settings: Settings
) -> ContractDocumentService:
    renderer = ContractRenderer(settings.template_path, settings)
    return ContractDocumentService(session, contracts, audit, renderer, WeasyPrintRenderer())
