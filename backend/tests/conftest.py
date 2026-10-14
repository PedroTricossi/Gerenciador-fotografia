from pathlib import Path

import pytest

from gerenciador.config import Settings, generate_key
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
