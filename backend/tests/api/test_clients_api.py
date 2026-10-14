from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

CONTRACTS = "/api/v1/contracts"
CLIENTS = "/api/v1/clients"
Payload = Callable[..., dict[str, Any]]


@pytest.fixture
def contract(api: TestClient, payload: Payload) -> dict[str, Any]:
    response = api.post(CONTRACTS, json=payload())
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def test_list_masks_cpfs(api: TestClient, contract: dict[str, Any]) -> None:
    body = api.get(CLIENTS).json()
    assert {item["full_name"] for item in body["items"]} == {"João da Silva", "Maria Souza"}
    assert {item["cpf"] for item in body["items"]} == {"***.***.***-09", "***.***.***-00"}
    assert body["next_cursor"] is None


def test_list_paginates_and_rejects_bad_cursor(api: TestClient, contract: dict[str, Any]) -> None:
    first = api.get(CLIENTS, params={"limit": 1}).json()
    assert len(first["items"]) == 1
    second = api.get(CLIENTS, params={"limit": 1, "cursor": first["next_cursor"]}).json()
    assert len(second["items"]) == 1
    assert second["items"][0]["id"] != first["items"][0]["id"]
    assert api.get(CLIENTS, params={"cursor": "garbage"}).status_code == 422


def test_get_returns_full_data(api: TestClient, contract: dict[str, Any]) -> None:
    body = api.get(f"{CLIENTS}/{contract['groom']['id']}").json()
    assert body["cpf"] == "123.456.789-09"
    assert body["address"] == "Rua das Flores 100"


def test_patch_corrects_a_client(api: TestClient, contract: dict[str, Any]) -> None:
    url = f"{CLIENTS}/{contract['groom']['id']}"
    response = api.patch(url, json={"full_name": "João Souza", "cpf": "111.444.777-35"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "João Souza"
    assert response.json()["cpf"] == "111.444.777-35"
    assert api.get(f"{CONTRACTS}/{contract['id']}").json()["groom"]["full_name"] == "João Souza"


def test_correcting_a_client_makes_an_older_contract_edit_stale(
    api: TestClient, contract: dict[str, Any]
) -> None:
    contract_url = f"{CONTRACTS}/{contract['id']}"
    corrected = api.patch(f"{CLIENTS}/{contract['groom']['id']}", json={"full_name": "João Souza"})
    assert corrected.status_code == 200

    fresh = api.get(contract_url)
    assert fresh.headers["ETag"] == '"2"'
    assert fresh.json()["version"] == 2

    stale = api.patch(
        contract_url,
        json={"groom": {"full_name": "João da Silva"}, "event": {"venue_name": "Catedral"}},
        headers={"If-Match": '"1"'},
    )
    assert stale.status_code == 412
    after = api.get(contract_url).json()
    assert after["groom"]["full_name"] == "João Souza"
    assert after["event"]["venue_name"] == "Igreja Matriz"

    events = api.get("/api/v1/audit-events", params={"entity_id": contract["id"]}).json()["items"]
    assert [event["action"] for event in events] == ["contract.updated", "contract.created"]
    assert events[0]["details"] == {"fields": ["groom"], "version": 2, "cause": "client.updated"}


@pytest.mark.parametrize(
    "body",
    [{}, {"full_name": None}, {"cpf": "123.456.789-00"}, {"full_name": " "}, {"nickname": "x"}],
)
def test_patch_validation(api: TestClient, contract: dict[str, Any], body: dict[str, Any]) -> None:
    response = api.patch(f"{CLIENTS}/{contract['groom']['id']}", json=body)
    assert response.status_code == 422


def test_patch_to_another_clients_cpf_conflicts(api: TestClient, contract: dict[str, Any]) -> None:
    url = f"{CLIENTS}/{contract['groom']['id']}"
    response = api.patch(url, json={"cpf": "987.654.321-00"})
    assert response.status_code == 409
    both = api.patch(url, json={"full_name": "Outro Nome", "cpf": "987.654.321-00"})
    assert both.status_code == 409

    unchanged = api.get(url).json()
    assert unchanged["full_name"] == "João da Silva"
    assert unchanged["cpf"] == "123.456.789-09"
    assert unchanged["address"] == "Rua das Flores 100"
    assert api.get(f"{CONTRACTS}/{contract['id']}").json()["version"] == 1


def test_export(api: TestClient, contract: dict[str, Any]) -> None:
    body = api.get(f"{CLIENTS}/{contract['bride']['id']}/export").json()
    assert body["client"]["cpf"] == "987.654.321-00"
    assert body["client"]["address"] == "Rua das Flores 100"
    assert body["contracts"] == [
        {
            "contract_id": contract["id"],
            "role": "bride",
            "event_date": "2027-03-14",
            "venue_name": "Igreja Matriz",
            "signing_date": "2026-10-13",
            "deleted_at": None,
        }
    ]
    assert body["exported_at"]


def test_anonymise_is_refused_while_a_contract_is_active(
    api: TestClient, contract: dict[str, Any]
) -> None:
    response = api.post(f"{CLIENTS}/{contract['groom']['id']}/anonymise")
    assert response.status_code == 409
    assert api.get(f"{CLIENTS}/{contract['groom']['id']}").json()["full_name"] == "João da Silva"


def test_anonymise_after_the_contract_is_deleted(api: TestClient, contract: dict[str, Any]) -> None:
    client_url = f"{CLIENTS}/{contract['groom']['id']}"
    contract_url = f"{CONTRACTS}/{contract['id']}"
    api.delete(contract_url)

    response = api.post(f"{client_url}/anonymise")
    assert response.status_code == 200
    body = response.json()
    assert (body["full_name"], body["cpf"], body["address"]) == (None, None, None)
    assert body["anonymised_at"] is not None

    assert api.post(f"{client_url}/anonymise").status_code == 409
    assert api.patch(client_url, json={"full_name": "X"}).status_code == 409
    assert api.post(f"{contract_url}/restore").status_code == 409
    assert api.get(contract_url).json()["groom"]["full_name"] is None


def test_unknown_and_malformed_ids(api: TestClient) -> None:
    missing = f"{CLIENTS}/{uuid4()}"
    assert api.get(missing).status_code == 404
    assert api.patch(missing, json={"full_name": "X"}).status_code == 404
    assert api.get(f"{missing}/export").status_code == 404
    assert api.post(f"{missing}/anonymise").status_code == 404
    assert api.get(f"{CLIENTS}/not-a-uuid").status_code == 422
