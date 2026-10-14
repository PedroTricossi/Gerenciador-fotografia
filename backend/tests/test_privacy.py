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


def test_replacing_a_person_on_a_contract_leaves_no_orphan_with_their_data(
    api: TestClient, payload: Payload, settings: Settings
) -> None:
    contract = api.post(CONTRACTS, json=payload()).json()
    old_groom = contract["groom"]["id"]
    edited = api.patch(
        f"{CONTRACTS}/{contract['id']}",
        json={"groom": {"full_name": "Pedro Lima", "cpf": "111.444.777-35"}},
        headers={"If-Match": '"1"'},
    )
    assert edited.status_code == 200
    assert edited.json()["groom"]["id"] != old_groom

    rows = {row["id"]: row for row in api.get(CLIENTS).json()["items"]}
    assert len(rows) == 3
    orphan = rows[old_groom]
    assert (orphan["full_name"], orphan["cpf"], orphan["address"]) == (None, None, None)
    assert orphan["anonymised_at"] is not None
    assert "João" not in api.get(CLIENTS).text

    raw = _disk(settings)
    assert "João da Silva".encode() not in raw
    assert "João".encode() not in raw
    assert b"Pedro Lima" in raw
    assert b"Maria Souza" in raw
    for needle in CPF_AND_ADDRESS:
        assert needle.encode() not in raw

    events = api.get("/api/v1/audit-events", params={"entity_id": old_groom}).json()["items"]
    assert [event["action"] for event in events] == ["client.anonymised", "client.created"]
    assert events[0]["details"] == {"cause": "replaced", "contract_id": contract["id"]}


def test_replacing_a_person_keeps_a_client_who_is_on_another_contract(
    api: TestClient, payload: Payload
) -> None:
    first = api.post(CONTRACTS, json=payload()).json()
    second = api.post(
        CONTRACTS, json=payload(event={"date": "2028-01-01", "venue_name": "Capela"})
    ).json()
    edited = api.patch(
        f"{CONTRACTS}/{first['id']}",
        json={"groom": {"full_name": "Pedro Lima", "cpf": "111.444.777-35"}},
        headers={"If-Match": '"1"'},
    )
    assert edited.status_code == 200

    kept = api.get(f"{CLIENTS}/{first['groom']['id']}").json()
    assert kept["full_name"] == "João da Silva"
    assert kept["cpf"] == "123.456.789-09"
    assert kept["address"] == "Rua das Flores 100"
    assert kept["anonymised_at"] is None
    assert api.get(f"{CONTRACTS}/{second['id']}").json()["groom"]["id"] == first["groom"]["id"]
    anonymised = api.get("/api/v1/audit-events", params={"action": "client.anonymised"})
    assert anonymised.json()["items"] == []


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
