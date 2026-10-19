import datetime as dt
from collections.abc import Callable, Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.config import Settings, generate_key
from gerenciador.db.migrate import init_database
from gerenciador.db.models import Service
from gerenciador.db.session import create_session_factory
from gerenciador.domain.instalments import month_of
from gerenciador.main import create_app
from gerenciador.services.audit_service import AuditService
from gerenciador.services.catalog_service import CatalogService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    InstalmentInput,
    ItemInput,
    PersonInput,
)
from gerenciador.services.crypto import FieldCipher
from gerenciador.services.pdf_renderer import WeasyPrintRenderer
from gerenciador.services.prewedding_service import PreweddingService


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


SERVICE_IDS = {
    "second": "5e7a1c00-0000-4000-8000-000000000001",
    "ceremony": "5e7a1c00-0000-4000-8000-000000000002",
    "dinner": "5e7a1c00-0000-4000-8000-000000000003",
    "prewedding": "5e7a1c00-0000-4000-8000-000000000004",
    "archived": "5e7a1c00-0000-4000-8000-000000000005",
}
_SERVICES = {
    "second": ("Diária segundo fotógrafo", 50000, False),
    "ceremony": ("Cobertura da cerimônia na igreja", 120000, False),
    "dinner": ("Cobertura das fotos protocolares e jantar", 60000, False),
    "prewedding": ("Ensaio de pré-wedding", 80000, True),
    "archived": ("Álbum antigo", 30000, False),
}


@pytest.fixture
def catalog(engine: Engine) -> dict[str, str]:
    """Five services, the last one archived, written straight to the database."""
    now = utcnow()
    with create_session_factory(engine)() as db_session:
        for key, (name, price, prewedding) in _SERVICES.items():
            db_session.add(
                Service(
                    id=SERVICE_IDS[key],
                    name=name,
                    default_price_cents=price,
                    is_prewedding=prewedding,
                    archived_at=now if key == "archived" else None,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
            )
        db_session.commit()
    return SERVICE_IDS


@pytest.fixture
def ctx() -> RequestContext:
    return RequestContext(actor="owner", request_id="test-request")


@pytest.fixture
def audit(session: Session) -> AuditService:
    return AuditService(session)


@pytest.fixture
def catalog_service(session: Session, audit: AuditService) -> CatalogService:
    return CatalogService(session, audit)


@pytest.fixture
def clients(session: Session, cipher: FieldCipher, audit: AuditService) -> ClientService:
    return ClientService(session, cipher, audit)


@pytest.fixture
def contracts(session: Session, clients: ClientService, audit: AuditService) -> ContractService:
    return ContractService(session, clients, audit)


@pytest.fixture
def preweddings(session: Session, audit: AuditService) -> PreweddingService:
    return PreweddingService(session, audit)


@pytest.fixture
def make_input(catalog: dict[str, str]) -> Callable[..., ContractInput]:
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
                ItemInput(catalog["second"], 50000),
                ItemInput(catalog["ceremony"], 120000),
                ItemInput(catalog["dinner"], 60000),
            ],
            pix_discount_cents=30000,
            signing_city="Curitiba",
            signing_date=dt.date(2026, 10, 13),
        )
        data = replace(base, **overrides)
        if data.instalments is None and "instalments" not in overrides:
            # A single instalment for the current month, whatever items the test sets.
            total = sum(i.amount_cents for i in data.items) - (data.pix_discount_cents or 0)
            data = replace(data, instalments=[InstalmentInput(month_of(dt.date.today()), total)])
        return data

    return _make


@pytest.fixture
def documents(
    session: Session, contracts: ContractService, audit: AuditService, settings: Settings
) -> ContractDocumentService:
    renderer = ContractRenderer(settings.template_path, settings)
    return ContractDocumentService(session, contracts, audit, renderer, WeasyPrintRenderer())


BASE_URL = "http://127.0.0.1:8000"


@pytest.fixture
def api(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        yield client


@pytest.fixture
def payload(catalog: dict[str, str]) -> Callable[..., dict[str, Any]]:
    def _make(**overrides: Any) -> dict[str, Any]:
        body: dict[str, Any] = {
            "groom": {"full_name": "João da Silva", "cpf": "123.456.789-09"},
            "bride": {"full_name": "Maria Souza", "cpf": "987.654.321-00"},
            "couple_address": "Rua das Flores 100",
            "event": {
                "date": "2027-03-14",
                "venue_name": "Igreja Matriz",
                "coverage_start": "16:00",
            },
            "photographer_count": 2,
            "payment": {
                "items": [
                    {"service_id": catalog["second"], "amount_cents": 50000},
                    {"service_id": catalog["ceremony"], "amount_cents": 120000},
                    {"service_id": catalog["dinner"], "amount_cents": 60000},
                ],
                "pix_discount_cents": 30000,
            },
            "signing": {"city": "Curitiba", "date": "2026-10-13"},
        }
        body.update(overrides)
        if "instalments" not in body:
            # A single instalment for the current month, whatever items the test sets.
            payment = body["payment"]
            total = sum(i["amount_cents"] for i in payment["items"]) - (
                payment.get("pix_discount_cents") or 0
            )
            body["instalments"] = [{"month": month_of(dt.date.today()), "amount_cents": total}]
        return body

    return _make
