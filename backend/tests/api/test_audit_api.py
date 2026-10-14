import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

CONTRACTS = "/api/v1/contracts"
AUDIT = "/api/v1/audit-events"
Payload = Callable[..., dict[str, Any]]


@pytest.fixture
def contract(api: TestClient, payload: Payload) -> dict[str, Any]:
    response = api.post(CONTRACTS, json=payload())
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def test_actions_appear_newest_first(api: TestClient, contract: dict[str, Any]) -> None:
    pdf = api.get(f"{CONTRACTS}/{contract['id']}/pdf")
    api.delete(f"{CONTRACTS}/{contract['id']}")

    events = api.get(AUDIT).json()["items"]
    assert [event["action"] for event in events] == [
        "contract.deleted",
        "contract.pdf_generated",
        "contract.created",
        "client.created",
        "client.created",
    ]
    assert all(event["actor"] == "owner" for event in events)
    assert all(event["outcome"] == "success" for event in events)
    generated = events[1]
    assert generated["entity_type"] == "contract"
    assert generated["entity_id"] == contract["id"]
    assert generated["details"] == {"version": 1, "sha256": pdf.headers["X-Content-SHA256"]}
    assert generated["request_id"] == pdf.headers["X-Request-ID"]


def test_audit_trail_holds_no_personal_values(api: TestClient, contract: dict[str, Any]) -> None:
    api.patch(f"/api/v1/clients/{contract['groom']['id']}", json={"full_name": "João Souza"})
    api.post(CONTRACTS, json={"groom": {"full_name": "Nome Rejeitado", "cpf": "000"}})
    text = api.get(AUDIT).text
    for needle in (
        "João",
        "Maria",
        "Souza",
        "Rejeitado",
        "12345678909",
        "123.456.789-09",
        "98765432100",
        "Flores",
    ):
        assert needle not in text


def test_filters(api: TestClient, contract: dict[str, Any]) -> None:
    by_action = api.get(AUDIT, params={"action": "client.created"}).json()["items"]
    assert len(by_action) == 2

    by_entity = api.get(AUDIT, params={"entity_id": contract["id"]}).json()["items"]
    assert [event["action"] for event in by_entity] == ["contract.created"]

    tomorrow = (dt.datetime.now(dt.UTC) + dt.timedelta(days=1)).isoformat()
    assert api.get(AUDIT, params={"from": tomorrow}).json()["items"] == []
    assert len(api.get(AUDIT, params={"to": tomorrow}).json()["items"]) == 3


def test_pagination(api: TestClient, contract: dict[str, Any]) -> None:
    first = api.get(AUDIT, params={"limit": 2}).json()
    assert len(first["items"]) == 2
    second = api.get(AUDIT, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None


@pytest.mark.parametrize(
    "params",
    [{"cursor": "abc"}, {"limit": 0}, {"from": "2026-10-13T12:00:00"}, {"to": "yesterday"}],
)
def test_bad_parameters(api: TestClient, params: dict[str, Any]) -> None:
    assert api.get(AUDIT, params=params).status_code == 422


def test_get_one_event(api: TestClient, contract: dict[str, Any]) -> None:
    newest = api.get(AUDIT).json()["items"][0]
    assert api.get(f"{AUDIT}/{newest['id']}").json() == newest
    assert api.get(f"{AUDIT}/999999").status_code == 404
    assert api.get(f"{AUDIT}/abc").status_code == 422


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_the_audit_trail_cannot_be_written_through_the_api(
    api: TestClient, contract: dict[str, Any], method: str
) -> None:
    newest = api.get(AUDIT).json()["items"][0]
    assert getattr(api, method)(f"{AUDIT}/{newest['id']}").status_code == 405
    assert api.get(f"{AUDIT}/{newest['id']}").json() == newest
