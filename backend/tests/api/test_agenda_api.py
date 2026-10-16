from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from gerenciador.services.agenda_service import TO_BEFORE_FROM, TOO_LONG

AGENDA = "/api/v1/agenda"
PROBLEM = "application/problem+json"
MARCH = {"from": "2027-03-01", "to": "2027-03-31"}
Payload = Callable[..., dict[str, Any]]


def _contract(api: TestClient, payload: Payload, catalog: dict[str, str]) -> str:
    items = [
        {"service_id": catalog["ceremony"], "amount_cents": 120000},
        {"service_id": catalog["prewedding"], "amount_cents": 80000},
    ]
    body = payload(
        payment={"items": items},
        prewedding={"date": "2027-03-10", "venue_name": "Parque Barigui"},
    )
    response = api.post("/api/v1/contracts", json=body)
    assert response.status_code == 201, response.text
    contract_id: str = response.json()["id"]
    return contract_id


def test_the_agenda_lists_both_shoots_with_names_only(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract_id = _contract(api, payload, catalog)
    couple = {
        "groom": {"full_name": "João da Silva"},
        "bride": {"full_name": "Maria Souza"},
    }

    response = api.get(AGENDA, params=MARCH)

    assert response.status_code == 200
    assert response.json() == [
        {
            "contract_id": contract_id,
            "kind": "prewedding",
            "date": "2027-03-10",
            "start_time": None,
            "venue_name": "Parque Barigui",
            **couple,
        },
        {
            "contract_id": contract_id,
            "kind": "wedding",
            "date": "2027-03-14",
            "start_time": "16:00:00",
            "venue_name": "Igreja Matriz",
            **couple,
        },
    ]
    for private in ("123.456.789-09", "12345678909", "Rua das Flores"):
        assert private not in response.text
    assert "ETag" not in response.headers


def test_a_deleted_contract_is_left_out(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract_id = _contract(api, payload, catalog)
    assert api.delete(f"/api/v1/contracts/{contract_id}").status_code == 204
    assert api.get(AGENDA, params=MARCH).json() == []


def test_range_errors(api: TestClient) -> None:
    missing = api.get(AGENDA, params={"to": "2027-03-31"})
    assert missing.status_code == 422
    assert missing.headers["content-type"] == PROBLEM
    assert [error["field"] for error in missing.json()["errors"]] == ["query.from"]

    backwards = api.get(AGENDA, params={"from": "2027-03-31", "to": "2027-03-01"})
    assert backwards.status_code == 422
    assert backwards.json()["errors"] == [{"field": "query.to", "message": TO_BEFORE_FROM}]

    too_long = api.get(AGENDA, params={"from": "2027-01-01", "to": "2027-05-01"})
    assert too_long.status_code == 422
    assert too_long.json()["errors"] == [{"field": "query.to", "message": TOO_LONG}]

    longest = api.get(AGENDA, params={"from": "2027-01-01", "to": "2027-04-30"})
    assert longest.status_code == 200
