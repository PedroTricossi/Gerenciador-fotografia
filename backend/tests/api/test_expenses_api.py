import json
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

URL = "/api/v1/expenses"
EVENTS = "/api/v1/expense-events"
TYPES = "/api/v1/expense-types"
CONTRACTS = "/api/v1/contracts"
AUDIT = "/api/v1/audit-events"
Payload = Callable[..., dict[str, Any]]
TRIP_FIELDS = ["contract_id", "event_kind", "transport_kind", "left_home_at", "distance_tenths"]


def _type_id(api: TestClient, name: str) -> str:
    rows = api.get(TYPES, params={"include_archived": True}).json()
    return next(row["id"] for row in rows if row["name"] == name)


def _contract(api: TestClient, payload: Payload, catalog: dict[str, str]) -> dict[str, Any]:
    items = [
        {"service_id": catalog["ceremony"], "amount_cents": 120000},
        {"service_id": catalog["prewedding"], "amount_cents": 80000},
    ]
    response = api.post(CONTRACTS, json=payload(payment={"items": items}))
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _trip(contract_id: str, **overrides: Any) -> dict[str, Any]:
    trip: dict[str, Any] = {
        "contract_id": contract_id,
        "event_kind": "wedding",
        "transport_kind": "car",
        "left_home_at": "13:30",
        "distance_tenths": 1234,
    }
    trip.update(overrides)
    return trip


def _body(api: TestClient, type_name: str = "Café", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "spent_on": "2026-10-10",
        "amount_cents": 2500,
        "type_id": _type_id(api, type_name),
        "description": "Padaria",
        "trip": None,
    }
    body.update(overrides)
    return body


def _create(api: TestClient, body: dict[str, Any]) -> dict[str, Any]:
    response = api.post(URL, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _patch(api: TestClient, expense: dict[str, Any], body: dict[str, Any]) -> Any:
    return api.patch(
        f"{URL}/{expense['id']}", json=body, headers={"If-Match": f'"{expense["version"]}"'}
    )


def _fields(response: Any) -> list[str]:
    return [error["field"] for error in response.json()["errors"]]


def test_create_without_trip_audits_only_version_and_count(api: TestClient) -> None:
    response = api.post(URL, json=_body(api))
    assert response.status_code == 201
    body = response.json()
    assert body["trip"] is None
    assert body["description"] == "Padaria"
    assert body["version"] == 1
    assert response.headers["ETag"] == '"1"'
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    events = [e for e in api.get(AUDIT).json()["items"] if e["action"] == "expense.created"]
    assert events[0]["details"] == {"version": 1, "instalment_count": 1}
    assert api.get(f"{URL}/{body['id']}").json() == body


def test_create_a_transport_expense_linked_to_the_wedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    trip = _trip(contract["id"])
    created = _create(api, _body(api, "Transporte", trip=trip))
    assert created["trip"] == trip
    assert api.get(f"{URL}/{created['id']}").json()["trip"] == trip


@pytest.mark.parametrize("missing", TRIP_FIELDS)
def test_each_trip_field_is_required(
    api: TestClient, payload: Payload, catalog: dict[str, str], missing: str
) -> None:
    contract = _contract(api, payload, catalog)
    trip = _trip(contract["id"])
    del trip[missing]
    response = api.post(URL, json=_body(api, "Transporte", trip=trip))
    assert response.status_code == 422
    assert _fields(response) == [f"trip.{missing}"]


def test_a_trip_on_another_type_is_refused(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    response = api.post(URL, json=_body(api, trip=_trip(contract["id"])))
    assert response.status_code == 422
    assert _fields(response) == ["trip"]


def test_links_must_point_to_an_active_event(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    plain = api.post(
        CONTRACTS,
        json=payload(
            payment={"items": [{"service_id": catalog["ceremony"], "amount_cents": 120000}]}
        ),
    ).json()
    response = api.post(
        URL, json=_body(api, "Transporte", trip=_trip(plain["id"], event_kind="prewedding"))
    )
    assert response.status_code == 422
    assert _fields(response) == ["trip.contract_id"]

    gone = _contract(api, payload, catalog)
    assert api.delete(f"{CONTRACTS}/{gone['id']}").status_code == 204
    response = api.post(URL, json=_body(api, "Transporte", trip=_trip(gone["id"])))
    assert response.status_code == 422
    assert _fields(response) == ["trip.contract_id"]

    unknown = api.post(
        URL, json=_body(api, "Transporte", trip=_trip("5e7a1c00-0000-4000-8000-0000000000ff"))
    )
    assert unknown.status_code == 422


def test_a_dangling_link_survives_an_unrelated_edit(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    other = _contract(api, payload, catalog)
    trip = _trip(contract["id"])
    created = _create(api, _body(api, "Transporte", trip=trip))
    assert api.delete(f"{CONTRACTS}/{contract['id']}").status_code == 204
    assert api.delete(f"{CONTRACTS}/{other['id']}").status_code == 204

    assert api.get(f"{URL}/{created['id']}").json()["trip"] == trip
    edited = _patch(api, created, {**_body(api, "Transporte", trip=trip), "amount_cents": 9900})
    assert edited.status_code == 200, edited.text
    assert edited.json()["amount_cents"] == 9900
    assert edited.json()["trip"] == trip

    relinked = _patch(api, edited.json(), _body(api, "Transporte", trip=_trip(other["id"])))
    assert relinked.status_code == 422
    assert _fields(relinked) == ["trip.contract_id"]


def test_changing_the_type_clears_the_trip(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    created = _create(api, _body(api, "Transporte", trip=_trip(contract["id"])))
    response = _patch(api, created, _body(api, "Café", trip=_trip(contract["id"])))
    assert response.status_code == 200
    assert response.json()["trip"] is None
    assert response.json()["version"] == 2
    assert response.headers["ETag"] == '"2"'
    events = [e for e in api.get(AUDIT).json()["items"] if e["action"] == "expense.updated"]
    assert events[0]["details"]["version"] == 2
    assert set(events[0]["details"]["fields"]) >= {"type_id", "trip"}


@pytest.mark.parametrize("description", ["Padaria\x00", "a\nb", "x" * 201])
def test_description_validation(api: TestClient, description: str) -> None:
    response = api.post(URL, json=_body(api, description=description))
    assert response.status_code == 422
    assert _fields(response) == ["description"]


def test_description_is_optional_and_blank_becomes_null(api: TestClient) -> None:
    assert _create(api, _body(api, description="   "))["description"] is None
    assert _create(api, _body(api, description=None))["description"] is None
    assert _create(api, _body(api, description="x" * 200))["description"] == "x" * 200


def test_an_archived_type_is_refused_on_create_but_kept_on_update(api: TestClient) -> None:
    created = _create(api, _body(api))
    assert api.post(f"{TYPES}/{created['type_id']}/archive").status_code == 200

    refused = api.post(URL, json=_body(api, type_id=created["type_id"]))
    assert refused.status_code == 422
    assert _fields(refused) == ["type_id"]

    kept = _patch(api, created, {**_body(api), "type_id": created["type_id"], "amount_cents": 1})
    assert kept.status_code == 200, kept.text
    assert kept.json()["amount_cents"] == 1

    moved = _patch(
        api, kept.json(), {**_body(api), "type_id": "5e7a1c00-0000-4000-8000-0000000000ff"}
    )
    assert moved.status_code == 422
    assert _fields(moved) == ["type_id"]


def test_delete(api: TestClient) -> None:
    created = _create(api, _body(api))
    url = f"{URL}/{created['id']}"
    assert api.delete(url).status_code == 428
    stale = api.delete(url, headers={"If-Match": '"9"'})
    assert stale.status_code == 412
    assert api.get(url).status_code == 200
    assert api.delete(url, headers={"If-Match": '"1"'}).status_code == 204
    assert api.get(url).status_code == 404
    deleted = [e for e in api.get(AUDIT).json()["items"] if e["action"] == "expense.deleted"]
    assert deleted[0]["details"] == {"version": 1}


def test_patch_needs_a_current_if_match(api: TestClient) -> None:
    created = _create(api, _body(api))
    url = f"{URL}/{created['id']}"
    assert api.patch(url, json=_body(api)).status_code == 428
    assert api.patch(url, json=_body(api), headers={"If-Match": '"9"'}).status_code == 412
    missing = f"{URL}/5e7a1c00-0000-4000-8000-0000000000ff"
    assert api.get(missing).status_code == 404


@pytest.mark.parametrize(
    "overrides",
    [
        {"amount_cents": 0},
        {"amount_cents": 1.5},
        {"spent_on": "nope"},
        {"extra": 1},
    ],
)
def test_body_validation(api: TestClient, overrides: dict[str, Any]) -> None:
    assert api.post(URL, json=_body(api, **overrides)).status_code == 422


@pytest.mark.parametrize("distance", [0, 50001])
def test_distance_range(
    api: TestClient, payload: Payload, catalog: dict[str, str], distance: int
) -> None:
    contract = _contract(api, payload, catalog)
    trip = _trip(contract["id"], distance_tenths=distance)
    response = api.post(URL, json=_body(api, "Transporte", trip=trip))
    assert response.status_code == 422
    assert _fields(response) == ["trip.distance_tenths"]


def test_events_list_weddings_and_preweddings_of_active_contracts(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    kept = _contract(api, payload, catalog)
    gone = _contract(api, payload, catalog)
    for contract in (kept, gone):
        put = api.put(
            f"{CONTRACTS}/{contract['id']}/prewedding",
            json={"date": "2027-01-20", "venue_name": "Parque Barigui"},
        )
        assert put.status_code == 201, put.text
    assert api.delete(f"{CONTRACTS}/{gone['id']}").status_code == 204

    rows = api.get(EVENTS).json()
    assert rows == [
        {
            "contract_id": kept["id"],
            "event_kind": "prewedding",
            "date": "2027-01-20",
            "groom_name": "João da Silva",
            "bride_name": "Maria Souza",
            "venue_name": "Parque Barigui",
            "venue_address": None,
        },
        {
            "contract_id": kept["id"],
            "event_kind": "wedding",
            "date": "2027-03-14",
            "groom_name": "João da Silva",
            "bride_name": "Maria Souza",
            "venue_name": "Igreja Matriz",
            "venue_address": None,
        },
    ]


def test_events_without_a_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    assert [row["event_kind"] for row in api.get(EVENTS).json()] == ["wedding"]
    assert api.get(EVENTS).json()[0]["contract_id"] == contract["id"]


def test_audit_holds_no_description_amount_or_distance(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    secret = "Segredo do Zé"
    body = _body(
        api,
        "Transporte",
        description=secret,
        amount_cents=987654,
        trip=_trip(contract["id"], distance_tenths=43211),
    )
    created = _create(api, body)
    updated = _patch(api, created, {**body, "amount_cents": 876543, "description": secret + "2"})
    assert updated.status_code == 200
    deleted = api.delete(
        f"{URL}/{created['id']}", headers={"If-Match": f'"{updated.json()["version"]}"'}
    )
    assert deleted.status_code == 204

    events = [e for e in api.get(AUDIT).json()["items"] if e["action"].startswith("expense.")]
    assert {e["action"] for e in events} == {
        "expense.created",
        "expense.updated",
        "expense.deleted",
    }
    text = json.dumps(events, ensure_ascii=False)
    for value in (secret, "987654", "876543", "43211", "4321.1"):
        assert value not in text


def test_create_with_instalments_returns_the_total_and_count(api: TestClient) -> None:
    response = api.post(
        URL, json=_body(api, "Equipamento", amount_cents=100000, instalment_count=3)
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["amount_cents"] == 100000
    assert body["instalment_count"] == 3
    assert api.get(f"{URL}/{body['id']}").json() == body


def test_count_defaults_to_one(api: TestClient) -> None:
    assert _create(api, _body(api))["instalment_count"] == 1


@pytest.mark.parametrize("count", [0, 25])
def test_count_outside_1_to_24_is_refused(api: TestClient, count: int) -> None:
    response = api.post(URL, json=_body(api, instalment_count=count))
    assert response.status_code == 422
    assert _fields(response) == ["instalment_count"]


def test_total_below_count_is_refused(api: TestClient) -> None:
    response = api.post(URL, json=_body(api, amount_cents=5, instalment_count=10))
    assert response.status_code == 422
    assert _fields(response) == ["amount_cents"]


def test_patch_without_count_resets_to_one(api: TestClient) -> None:
    created = _create(api, _body(api, amount_cents=9000, instalment_count=3))
    response = _patch(api, created, _body(api, amount_cents=9000))
    assert response.status_code == 200
    assert response.json()["instalment_count"] == 1
    assert response.json()["version"] == 2


def test_patch_changes_the_count_and_audits_it(api: TestClient) -> None:
    created = _create(api, _body(api, amount_cents=9000, instalment_count=3))
    response = _patch(api, created, _body(api, amount_cents=9000, instalment_count=10))
    assert response.status_code == 200
    assert response.json()["instalment_count"] == 10
    events = [e for e in api.get(AUDIT).json()["items"] if e["action"] == "expense.updated"]
    assert "instalment_count" in events[0]["details"]["fields"]


def test_patch_total_below_count_is_refused(api: TestClient) -> None:
    created = _create(api, _body(api))
    response = _patch(api, created, _body(api, amount_cents=5, instalment_count=10))
    assert response.status_code == 422
    assert _fields(response) == ["amount_cents"]


def test_delete_removes_an_instalment_expense(api: TestClient) -> None:
    created = _create(api, _body(api, amount_cents=9000, instalment_count=3))
    url = f"{URL}/{created['id']}"
    assert api.delete(url, headers={"If-Match": '"1"'}).status_code == 204
    assert api.get(url).status_code == 404
