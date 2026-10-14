from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from gerenciador.config import Settings, generate_key
from gerenciador.db.migrate import init_database
from gerenciador.db.session import create_session_factory
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.crypto import FieldCipher


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
