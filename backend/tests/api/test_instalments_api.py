from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

CONTRACTS = "/api/v1/contracts"
LIST = "/api/v1/instalments"
AUDIT = "/api/v1/audit-events"
PAID_ON = {"paid_on": "2026-10-05"}
Payload = Callable[..., dict[str, Any]]


def _plan(*months: str) -> list[dict[str, Any]]:
    return [{"month": m, "amount_cents": 100000} for m in months]


def _make(api: TestClient, payload: Payload, *months: str, **overrides: Any) -> dict[str, Any]:
    body = payload(
        payment={
            "items": [
                {"service_id": overrides.pop("service"), "amount_cents": 100000 * len(months)}
            ]
        },
        instalments=_plan(*months),
        **overrides,
    )
    response = api.post(CONTRACTS, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


@pytest.fixture
def contract(api: TestClient, payload: Payload, catalog: dict[str, str]) -> dict[str, Any]:
    return _make(api, payload, "2026-10", "2026-11", service=catalog["ceremony"])


def _paid_url(contract: dict[str, Any], number: int) -> str:
    return f"{CONTRACTS}/{contract['id']}/instalments/{number}/paid"


def test_marking_paid_stores_the_date_and_leaves_the_contract_alone(
    api: TestClient, contract: dict[str, Any]
) -> None:
    response = api.post(_paid_url(contract, 1), json=PAID_ON)

    assert response.status_code == 200
    assert response.json() == {
        "number": 1,
        "month": "2026-10",
        "amount_cents": 100000,
        "paid_on": "2026-10-05",
    }
    after = api.get(f"{CONTRACTS}/{contract['id']}")
    assert after.json()["version"] == contract["version"]
    assert after.json()["updated_at"] == contract["updated_at"]
    assert after.json()["instalments"][0]["paid_on"] == "2026-10-05"
    events = api.get(AUDIT).json()["items"]
    assert events[0]["action"] == "instalment.paid"
    assert events[0]["entity_type"] == "contract"
    assert events[0]["entity_id"] == contract["id"]
    assert events[0]["details"] == {"number": 1, "month": "2026-10"}


def test_marking_paid_twice_is_a_conflict(api: TestClient, contract: dict[str, Any]) -> None:
    assert api.post(_paid_url(contract, 1), json=PAID_ON).status_code == 200

    response = api.post(_paid_url(contract, 1), json=PAID_ON)

    assert response.status_code == 409
    assert response.json()["detail"] == "already paid"


def test_undoing_a_payment_clears_the_date(api: TestClient, contract: dict[str, Any]) -> None:
    api.post(_paid_url(contract, 1), json=PAID_ON)

    response = api.delete(_paid_url(contract, 1))

    assert response.status_code == 200
    assert response.json()["paid_on"] is None
    assert api.get(AUDIT).json()["items"][0]["action"] == "instalment.unpaid"
    assert api.get(AUDIT).json()["items"][0]["details"] == {"number": 1, "month": "2026-10"}
    assert api.get(f"{CONTRACTS}/{contract['id']}").json()["version"] == contract["version"]


def test_undoing_an_unpaid_instalment_is_a_conflict(
    api: TestClient, contract: dict[str, Any]
) -> None:
    assert api.delete(_paid_url(contract, 1)).status_code == 409


def test_an_unknown_number_or_contract_is_not_found(
    api: TestClient, contract: dict[str, Any]
) -> None:
    assert api.post(_paid_url(contract, 3), json=PAID_ON).status_code == 404
    assert api.delete(_paid_url(contract, 3)).status_code == 404
    missing = f"{CONTRACTS}/00000000-0000-4000-8000-000000000000/instalments/1/paid"
    assert api.post(missing, json=PAID_ON).status_code == 404


def test_a_deleted_contract_refuses_both_actions(api: TestClient, contract: dict[str, Any]) -> None:
    api.post(_paid_url(contract, 1), json=PAID_ON)
    assert api.delete(f"{CONTRACTS}/{contract['id']}").status_code == 204

    assert api.post(_paid_url(contract, 2), json=PAID_ON).status_code == 409
    assert api.delete(_paid_url(contract, 1)).status_code == 409


@pytest.mark.parametrize("body", [{}, {"paid_on": "not-a-date"}, {"paid_on": None}])
def test_paid_on_must_be_a_date(api: TestClient, contract: dict[str, Any], body: Any) -> None:
    assert api.post(_paid_url(contract, 1), json=body).status_code == 422


def test_marking_paid_without_origin_is_rejected(api: TestClient, contract: dict[str, Any]) -> None:
    del api.headers["Origin"]
    assert api.post(_paid_url(contract, 1), json=PAID_ON).status_code == 403


def test_the_list_orders_by_month_event_date_and_number(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    later = _make(api, payload, "2026-10", "2026-11", service=catalog["ceremony"])
    sooner = _make(
        api,
        payload,
        "2026-10",
        service=catalog["ceremony"],
        event={"date": "2027-01-10", "venue_name": "Igreja Matriz"},
    )

    items = api.get(LIST).json()

    assert [(i["contract_id"], i["number"]) for i in items] == [
        (sooner["id"], 1),
        (later["id"], 1),
        (later["id"], 2),
    ]
    assert items[1] == {
        "contract_id": later["id"],
        "groom_name": "João da Silva",
        "bride_name": "Maria Souza",
        "number": 1,
        "count": 2,
        "month": "2026-10",
        "amount_cents": 100000,
        "paid_on": None,
        "plan_needs_review": False,
    }
    assert "123.456.789-09" not in api.get(LIST).text


def test_the_list_hides_deleted_contracts(api: TestClient, contract: dict[str, Any]) -> None:
    api.delete(f"{CONTRACTS}/{contract['id']}")
    assert api.get(LIST).json() == []


def test_unpaid_through_lists_only_unpaid_instalments_up_to_that_month(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _make(
        api, payload, "2026-09", "2026-10", "2026-11", "2026-12", service=catalog["ceremony"]
    )
    api.post(_paid_url(contract, 1), json=PAID_ON)

    items = api.get(LIST, params={"unpaid_through": "2026-10"}).json()

    assert [(i["number"], i["month"]) for i in items] == [(2, "2026-10")]
    both = api.get(LIST, params={"unpaid_through": "2026-11"}).json()
    assert [i["month"] for i in both] == ["2026-10", "2026-11"]


def test_unpaid_through_must_be_a_month(api: TestClient) -> None:
    assert api.get(LIST, params={"unpaid_through": "2026-13"}).status_code == 422
