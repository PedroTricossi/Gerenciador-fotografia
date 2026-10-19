from typing import Any

import pytest
from fastapi.testclient import TestClient

URL = "/api/v1/expense-types"
PROBLEM = "application/problem+json"
MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"


def _all(api: TestClient) -> dict[str, dict[str, Any]]:
    rows = api.get(URL, params={"include_archived": True}).json()
    return {row["name"]: row for row in rows}


def test_list_returns_the_six_seeded_types(api: TestClient) -> None:
    rows = api.get(URL).json()
    assert len(rows) == 6
    keys = {row["key"] for row in rows}
    assert {"transport", "second_photographer"} <= keys
    names = [row["name"] for row in rows]
    assert names == sorted(names, key=lambda n: n.casefold())


def test_create_and_duplicate_name(api: TestClient) -> None:
    response = api.post(URL, json={"name": " Estacionamento "})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Estacionamento"
    assert body["key"] is None
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    assert response.headers["ETag"] == '"1"'
    assert api.post(URL, json={"name": "estacionamento"}).status_code == 409


def test_rename_keeps_the_key(api: TestClient) -> None:
    transport = _all(api)["Transporte"]
    response = api.patch(
        f"{URL}/{transport['id']}", json={"name": "Deslocamento"}, headers={"If-Match": '"1"'}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Deslocamento"
    assert response.json()["key"] == "transport"
    assert response.headers["ETag"] == '"2"'


def test_stale_if_match(api: TestClient) -> None:
    transport = _all(api)["Transporte"]
    url = f"{URL}/{transport['id']}"
    assert api.patch(url, json={"name": "X"}).status_code == 428
    stale = api.patch(url, json={"name": "X"}, headers={"If-Match": '"9"'})
    assert stale.status_code == 412


@pytest.mark.parametrize("name", ["Transporte", "2º fotógrafo"])
def test_keyed_types_cannot_be_archived(api: TestClient, name: str) -> None:
    row = _all(api)[name]
    response = api.post(f"{URL}/{row['id']}/archive")
    assert response.status_code == 409
    assert response.headers["content-type"] == PROBLEM
    assert response.json()["detail"] == "this type cannot be archived"


def test_archive_and_restore(api: TestClient) -> None:
    cafe = _all(api)["Café"]
    archived = api.post(f"{URL}/{cafe['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert "Café" not in [row["name"] for row in api.get(URL).json()]
    assert "Café" in _all(api)
    restored = api.post(f"{URL}/{cafe['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None


@pytest.mark.parametrize("body", [{}, {"name": ""}, {"name": "x" * 61}, {"name": "A\x00"}])
def test_name_validation(api: TestClient, body: dict[str, Any]) -> None:
    response = api.post(URL, json=body)
    assert response.status_code == 422


def test_unknown_type_is_404(api: TestClient) -> None:
    assert api.get(f"{URL}/{MISSING}").status_code == 404


def test_audit_details_hold_no_names(api: TestClient) -> None:
    created = api.post(URL, json={"name": "Estacionamento Secreto"}).json()
    url = f"{URL}/{created['id']}"
    api.patch(url, json={"name": "Garagem Reservada"}, headers={"If-Match": '"1"'})
    api.post(f"{url}/archive")
    events = api.get("/api/v1/audit-events", params={"entity_id": created["id"]}).json()["items"]
    assert {event["action"] for event in events} == {
        "expense_type.created",
        "expense_type.updated",
        "expense_type.archived",
    }
    for event in events:
        assert set(event["details"]) <= {"version", "fields"}
    text = str([event["details"] for event in events])
    for value in ("Estacionamento", "Secreto", "Garagem", "Reservada"):
        assert value not in text
