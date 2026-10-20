from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

FEE = "/api/v1/second-photographer-fee"
CONTRACTS = "/api/v1/contracts"
AUDIT = "/api/v1/audit-events"
Payload = Callable[..., dict[str, Any]]


def _contract(api: TestClient, payload: Payload, **overrides: Any) -> dict[str, Any]:
    response = api.post(CONTRACTS, json=payload(**overrides))
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _events(api: TestClient, prefix: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = api.get(AUDIT).json()["items"]
    return [e for e in items if e["action"].startswith(prefix)]


def test_standard_fee_starts_empty_then_adds_and_replaces(api: TestClient) -> None:
    assert api.get(FEE).json() == {"prices": []}
    added = api.post(f"{FEE}/prices", json={"from_month": "2026-06", "amount_cents": 50000})
    assert added.status_code == 200
    assert added.json() == {"prices": [{"from_month": "2026-06", "amount_cents": 50000}]}
    api.post(f"{FEE}/prices", json={"from_month": "2026-01", "amount_cents": 40000})
    replaced = api.post(f"{FEE}/prices", json={"from_month": "2026-06", "amount_cents": 55000})
    assert replaced.json()["prices"] == [
        {"from_month": "2026-01", "amount_cents": 40000},
        {"from_month": "2026-06", "amount_cents": 55000},
    ]
    assert api.get(FEE).json() == replaced.json()
    events = _events(api, "second_photographer_fee.set")
    assert all(e["entity_type"] == "second_photographer_fee" for e in events)
    assert next(e["details"] for e in events) == {"from_month": "2026-06"}
    for event in events:
        assert set(event["details"]) <= {"from_month"}
        assert 55000 not in event["details"].values()


def test_bad_month_is_refused(api: TestClient) -> None:
    response = api.post(f"{FEE}/prices", json={"from_month": "2026-6", "amount_cents": 1})
    assert response.status_code == 422


def test_override_leaves_the_contract_untouched(api: TestClient, payload: Payload) -> None:
    contract = _contract(api, payload)
    path = f"{CONTRACTS}/{contract['id']}/second-photographer-fee"
    response = api.put(path, json={"amount_cents": 45000})
    assert response.status_code == 200
    assert response.json() == {"contract_id": contract["id"], "amount_cents": 45000}
    again = api.put(path, json={"amount_cents": 46000})
    assert again.json()["amount_cents"] == 46000
    after = api.get(f"{CONTRACTS}/{contract['id']}").json()
    assert after["version"] == contract["version"]
    assert after["updated_at"] == contract["updated_at"]
    assert api.delete(path).status_code == 204
    assert api.delete(path).status_code == 204
    set_events = _events(api, "second_photographer_override.set")
    cleared = _events(api, "second_photographer_override.cleared")
    assert set_events and cleared
    for event in set_events + cleared:
        assert event["entity_type"] == "contract"
        assert event["entity_id"] == contract["id"]
        assert event["details"] == {}


def test_override_needs_two_photographers(api: TestClient, payload: Payload) -> None:
    contract = _contract(api, payload, photographer_count=1)
    path = f"{CONTRACTS}/{contract['id']}/second-photographer-fee"
    refused = api.put(path, json={"amount_cents": 45000})
    assert refused.status_code == 409
    assert refused.json()["code"] == "no_second_photographer"


def test_override_on_a_deleted_contract_is_refused(api: TestClient, payload: Payload) -> None:
    contract = _contract(api, payload)
    api.delete(f"{CONTRACTS}/{contract['id']}")
    path = f"{CONTRACTS}/{contract['id']}/second-photographer-fee"
    refused = api.put(path, json={"amount_cents": 45000})
    assert refused.status_code == 409
    assert refused.json()["code"] == "contract_deleted"


def test_unknown_contract_is_404(api: TestClient) -> None:
    path = f"{CONTRACTS}/00000000-0000-4000-8000-000000000000/second-photographer-fee"
    assert api.put(path, json={"amount_cents": 45000}).status_code == 404
    assert api.delete(path).status_code == 404


def test_audit_holds_no_amounts(api: TestClient, payload: Payload) -> None:
    contract = _contract(api, payload)
    api.put(f"{CONTRACTS}/{contract['id']}/second-photographer-fee", json={"amount_cents": 45123})
    api.post(f"{FEE}/prices", json={"from_month": "2026-06", "amount_cents": 50123})
    text = str(_events(api, "second_photographer"))
    assert "45123" not in text
    assert "50123" not in text
