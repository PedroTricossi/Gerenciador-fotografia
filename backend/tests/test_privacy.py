import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"
CONTRACTS = "/api/v1/contracts"
CLIENTS = "/api/v1/clients"
Payload = Callable[..., dict[str, Any]]

CPF_AND_ADDRESS = (
    "12345678909",
    "123.456.789-09",
    "98765432100",
    "987.654.321-00",
    "Rua das Flores 100",
)


def _disk(settings: Settings) -> bytes:
    """Every byte the database has on disk, including journal files."""
    folder: Path = settings.database_path.parent
    return b"".join(path.read_bytes() for path in sorted(folder.iterdir()) if path.is_file())


def test_cpf_and_address_are_never_stored_in_plain_text(
    api: TestClient, payload: Payload, settings: Settings
) -> None:
    assert api.post(CONTRACTS, json=payload()).status_code == 201
    raw = _disk(settings)
    assert "João da Silva".encode() in raw
    for needle in CPF_AND_ADDRESS:
        assert needle.encode() not in raw


def test_anonymising_removes_the_person_from_disk(
    api: TestClient, payload: Payload, settings: Settings
) -> None:
    contract = api.post(CONTRACTS, json=payload()).json()
    api.delete(f"{CONTRACTS}/{contract['id']}")
    assert api.post(f"{CLIENTS}/{contract['groom']['id']}/anonymise").status_code == 200

    raw = _disk(settings)
    assert "João da Silva".encode() not in raw
    assert "João".encode() not in raw
    assert b"Maria Souza" in raw


def test_logs_contain_no_personal_data(
    settings: Settings, payload: Payload, caplog: pytest.LogCaptureFixture
) -> None:
    # INFO makes SQLAlchemy log every statement. It must be set before the engine
    # is created. DEBUG is deliberately not covered: at DEBUG, SQLAlchemy logs
    # result rows, which include client names. Never enable it in production.
    caplog.set_level(logging.INFO)
    caplog.set_level(logging.INFO, logger="sqlalchemy.engine")

    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        contract = client.post(CONTRACTS, json=payload()).json()
        client.get(f"{CONTRACTS}/{contract['id']}/pdf")
        client.get(f"{CLIENTS}/{contract['groom']['id']}/export")
        client.post(CONTRACTS, json=payload(couple_address=""))

    text = caplog.text
    assert "INSERT INTO clients" in text
    for needle in (*CPF_AND_ADDRESS, "João", "Maria", "Souza"):
        assert needle not in text
