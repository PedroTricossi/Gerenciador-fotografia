import base64
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from gerenciador.config import REPO_ROOT, Settings, generate_key


def _kwargs(tmp_path: Path, **overrides: Any) -> dict[str, Any]:
    values: dict[str, Any] = {
        "_env_file": None,
        "contractor_name": "Fotografia Teste",
        "contractor_cpf": "111.444.777-35",
        "contractor_address": "Rua Exemplo 1",
        "contractor_representative": "Pessoa Teste",
        "field_encryption_key": generate_key(),
        "cpf_lookup_key": generate_key(),
        "database_path": tmp_path / "test.db",
        "host": "127.0.0.1",
        "port": 8000,
    }
    values.update(overrides)
    return values


def test_valid_settings(settings: Settings) -> None:
    assert settings.contractor_cpf == "11144477735"
    assert settings.host == "127.0.0.1"
    assert len(settings.encryption_key_bytes()) == 32
    assert len(settings.lookup_key_bytes()) == 32
    assert settings.template_path == REPO_ROOT / "base_contract" / "contract_template.md"


def test_generate_key_is_32_random_bytes() -> None:
    first, second = generate_key(), generate_key()
    assert len(base64.urlsafe_b64decode(first)) == 32
    assert first != second


@pytest.mark.parametrize("key", ["", "short", base64.urlsafe_b64encode(b"x" * 16).decode()])
def test_rejects_malformed_keys(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValidationError):
        Settings(**_kwargs(tmp_path, field_encryption_key=key))


def test_rejects_identical_keys(tmp_path: Path) -> None:
    key = generate_key()
    with pytest.raises(ValidationError, match="must differ"):
        Settings(**_kwargs(tmp_path, field_encryption_key=key, cpf_lookup_key=key))


def test_rejects_invalid_contractor_cpf(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        Settings(**_kwargs(tmp_path, contractor_cpf="123.456.789-00"))


@pytest.mark.parametrize("host", ["0.0.0.0", "192.168.0.10", "example.com", "::"])
def test_refuses_to_bind_outside_loopback(tmp_path: Path, host: str) -> None:
    with pytest.raises(ValidationError, match="no authentication"):
        Settings(**_kwargs(tmp_path, host=host))


def test_validation_errors_do_not_reveal_keys(tmp_path: Path) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(**_kwargs(tmp_path, field_encryption_key="my-secret-value"))
    assert "my-secret-value" not in str(error.value)
