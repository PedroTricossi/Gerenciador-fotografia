from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

URL = "/api/v1/expense-entries"
EXPENSES = "/api/v1/expenses"
FIXED = "/api/v1/fixed-costs"
FEE = "/api/v1/second-photographer-fee"
TYPES = "/api/v1/expense-types"
CONTRACTS = "/api/v1/contracts"
Payload = Callable[..., dict[str, Any]]


def _type_id(api: TestClient, name: str) -> str:
    rows = api.get(TYPES, params={"include_archived": True}).json()
    return next(row["id"] for row in rows if row["name"] == name)


def _contract(api: TestClient, payload: Payload, **overrides: Any) -> dict[str, Any]:
    event = {"date": "2026-10-11", "venue_name": "Igreja Matriz", "venue_address": "Rua A, 1"}
    body = payload(event=event, **overrides)
    response = api.post(CONTRACTS, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _patch_contract(api: TestClient, contract: dict[str, Any], body: dict[str, Any]) -> Any:
    return api.patch(
        f"{CONTRACTS}/{contract['id']}", json=body, headers={"If-Match": f'"{contract["version"]}"'}
    )


def _manual(api: TestClient, type_name: str, spent_on: str, **extra: Any) -> dict[str, Any]:
    body = {
        "spent_on": spent_on,
        "amount_cents": 2500,
        "type_id": _type_id(api, type_name),
        "description": "x",
        "trip": None,
    }
    body.update(extra)
    response = api.post(EXPENSES, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _trip(contract_id: str, kind: str = "wedding") -> dict[str, Any]:
    return {
        "contract_id": contract_id,
        "event_kind": kind,
        "transport_kind": "ride_app",
        "left_home_at": "13:30",
        "distance_tenths": 100,
    }


def _fixed(api: TestClient, **extra: Any) -> dict[str, Any]:
    body = {
        "name": "Adobe",
        "type_id": _type_id(api, "Assinatura"),
        "day_of_month": 3,
        "start_month": "2026-05",
        "amount_cents": 12400,
    }
    body.update(extra)
    response = api.post(FIXED, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _standard(api: TestClient, month: str = "2026-01", amount: int = 50000) -> None:
    response = api.post(f"{FEE}/prices", json={"from_month": month, "amount_cents": amount})
    assert response.status_code == 200


def _entries(api: TestClient, start: str, end: str) -> dict[str, Any]:
    response = api.get(URL, params={"from": start, "to": end})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def _fees(body: dict[str, Any]) -> list[dict[str, Any]]:
    return [e for e in body["entries"] if e["source"] == "second_photographer"]


def test_october_merges_the_three_sources(api: TestClient, payload: Payload) -> None:
    fixed = _fixed(api)
    contract = _contract(api, payload)
    _standard(api)
    cafe = _manual(api, "Café", "2026-10-14", amount_cents=1000)
    uber = _manual(api, "Transporte", "2026-10-11", trip=_trip(contract["id"]))

    body = _entries(api, "2026-10", "2026-10")
    assert [e["id"] for e in body["entries"]] == [
        f"fixed:{fixed['id']}:2026-10",
        f"manual:{uber['id']}",
        f"fee:{contract['id']}",
        f"manual:{cafe['id']}",
    ]
    assert body["total_cents"] == 12400 + 2500 + 50000 + 1000
    adobe, trip, fee, coffee = body["entries"]
    assert adobe["source"] == "fixed"
    assert adobe["description"] == "Adobe"
    assert adobe["date"] == "2026-10-03"
    assert adobe["fixed_cost_id"] == fixed["id"]
    assert adobe["type_name"] == "Assinatura"
    assert adobe["link_state"] is None
    assert trip["link_state"] == "ok"
    assert trip["venue_name"] == "Igreja Matriz"
    assert trip["groom_name"] == "João da Silva"
    assert trip["transport_kind"] == "ride_app"
    assert trip["version"] == 1
    assert fee["description"] is None
    assert fee["event_kind"] == "wedding"
    assert fee["link_state"] == "ok"
    assert fee["type_key"] == "second_photographer"
    assert fee["venue_address"] == "Rua A, 1"
    assert fee["bride_name"] == "Maria Souza"
    assert fee["override"] is False
    assert fee["missing_amount"] is False
    assert coffee["link_state"] is None
    assert coffee["groom_name"] is None


def test_the_fee_follows_the_contract(api: TestClient, payload: Payload) -> None:
    contract = _contract(api, payload)
    _standard(api)
    path = f"{CONTRACTS}/{contract['id']}/second-photographer-fee"
    assert api.put(path, json={"amount_cents": 45000}).status_code == 200
    assert _fees(_entries(api, "2026-10", "2026-10"))[0]["amount_cents"] == 45000

    moved = _patch_contract(api, contract, {"event": {"date": "2026-11-11"}})
    assert moved.status_code == 200, moved.text
    assert _fees(_entries(api, "2026-10", "2026-10")) == []
    assert len(_fees(_entries(api, "2026-11", "2026-11"))) == 1

    solo = _patch_contract(api, moved.json(), {"photographer_count": 1})
    assert solo.status_code == 200, solo.text
    assert _fees(_entries(api, "2026-11", "2026-11")) == []
    duo = _patch_contract(api, solo.json(), {"photographer_count": 2})
    assert duo.status_code == 200, duo.text
    assert len(_fees(_entries(api, "2026-11", "2026-11"))) == 1

    assert api.delete(f"{CONTRACTS}/{contract['id']}").status_code == 204
    assert _fees(_entries(api, "2026-11", "2026-11")) == []
    assert api.post(f"{CONTRACTS}/{contract['id']}/restore").status_code == 200
    restored = _fees(_entries(api, "2026-11", "2026-11"))
    assert [(e["amount_cents"], e["override"]) for e in restored] == [(45000, True)]


def test_a_wedding_before_any_standard_has_a_missing_amount(
    api: TestClient, payload: Payload
) -> None:
    event = {"date": "2025-12-06", "venue_name": "Igreja Matriz"}
    created = api.post(CONTRACTS, json=payload(event=event))
    assert created.status_code == 201, created.text
    _standard(api, "2026-01")
    body = _entries(api, "2025-12", "2025-12")
    fee = _fees(body)[0]
    assert (fee["amount_cents"], fee["missing_amount"]) == (0, True)
    assert body["total_cents"] == 0


def test_dangling_links_hide_the_event(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    gone = _contract(api, payload)
    items = [
        {"service_id": catalog["ceremony"], "amount_cents": 120000},
        {"service_id": catalog["prewedding"], "amount_cents": 80000},
    ]
    pre = _contract(api, payload, payment={"items": items})
    put = api.put(
        f"{CONTRACTS}/{pre['id']}/prewedding",
        json={"date": "2026-10-05", "venue_name": "Parque"},
    )
    assert put.status_code == 201, put.text
    ok = _manual(api, "Transporte", "2026-10-05", trip=_trip(pre["id"], "prewedding"))
    uber = _manual(api, "Transporte", "2026-10-11", trip=_trip(gone["id"]))
    by_id = {e["id"]: e for e in _entries(api, "2026-10", "2026-10")["entries"]}
    assert by_id[f"manual:{ok['id']}"]["venue_name"] == "Parque"
    assert by_id[f"manual:{ok['id']}"]["link_state"] == "ok"

    assert api.delete(f"{CONTRACTS}/{gone['id']}").status_code == 204
    current = api.get(f"{CONTRACTS}/{pre['id']}").json()
    cancel = _patch_contract(
        api, current, {"payment": {"items": items[:1]}, "cancel_prewedding": True}
    )
    assert cancel.status_code == 200, cancel.text
    by_id = {e["id"]: e for e in _entries(api, "2026-10", "2026-10")["entries"]}
    lost = by_id[f"manual:{uber['id']}"]
    assert lost["link_state"] == "contract_deleted"
    for field in ("venue_name", "venue_address", "groom_name", "bride_name"):
        assert lost[field] is None
    cancelled = by_id[f"manual:{ok['id']}"]
    assert cancelled["link_state"] == "prewedding_cancelled"
    assert cancelled["venue_name"] is None
    assert cancelled["groom_name"] == pre["groom"]["full_name"]
    assert cancelled["bride_name"] == pre["bride"]["full_name"]


def test_a_stopped_cost_ends_and_a_backdated_price_changes_later_months(
    api: TestClient,
) -> None:
    cost = _fixed(api)
    stopped = api.post(f"{FIXED}/{cost['id']}/stop", json={"end_month": "2026-07"})
    assert stopped.status_code == 200
    months = [e["date"][:7] for e in _entries(api, "2026-05", "2026-09")["entries"]]
    assert months == ["2026-05", "2026-06", "2026-07"]

    assert api.post(f"{FIXED}/{cost['id']}/resume").status_code == 200
    price = api.post(
        f"{FIXED}/{cost['id']}/prices", json={"from_month": "2026-07", "amount_cents": 20000}
    )
    assert price.status_code == 200
    amounts = [e["amount_cents"] for e in _entries(api, "2026-05", "2026-08")["entries"]]
    assert amounts == [12400, 12400, 20000, 20000]


def test_range_checks(api: TestClient) -> None:
    for params in (
        {"from": "2026-10", "to": "2026-09"},
        {"from": "2026-01", "to": "2028-01"},
        {"from": "2026-1", "to": "2026-10"},
        {"from": "2026-01"},
    ):
        assert api.get(URL, params=params).status_code == 422
    assert api.get(URL, params={"from": "2026-01", "to": "2027-12"}).status_code == 200


def _manual_entries(api: TestClient, start: str, end: str) -> list[dict[str, Any]]:
    return [e for e in _entries(api, start, end)["entries"] if e["source"] == "manual"]


def test_instalments_land_one_per_month(api: TestClient) -> None:
    created = _manual(api, "Café", "2026-01-15", amount_cents=100000, instalment_count=3)

    rows = _manual_entries(api, "2026-01", "2026-03")

    assert [r["amount_cents"] for r in rows] == [33333, 33333, 33334]
    assert [r["instalment_number"] for r in rows] == [1, 2, 3]
    assert {r["instalment_count"] for r in rows} == {3}
    assert [r["id"] for r in rows] == [f"manual:{created['id']}:{n}" for n in (1, 2, 3)]
    assert [r["date"] for r in rows] == ["2026-01-15", "2026-02-15", "2026-03-15"]


def test_a_purchase_before_the_range_shows_its_later_instalments(api: TestClient) -> None:
    _manual(api, "Café", "2026-03-10", amount_cents=100000, instalment_count=10)

    rows = _manual_entries(api, "2026-09", "2026-09")

    assert len(rows) == 1
    assert rows[0]["instalment_number"] == 7
    assert rows[0]["date"] == "2026-09-10"


def test_a_range_in_the_middle_shows_only_those_instalments(api: TestClient) -> None:
    _manual(api, "Café", "2026-03-10", amount_cents=100000, instalment_count=10)

    rows = _manual_entries(api, "2026-05", "2026-06")

    assert [r["instalment_number"] for r in rows] == [3, 4]


def test_the_longest_plan_reaches_back_23_months_and_no_further(api: TestClient) -> None:
    # 24x is the longest plan: its last instalment lands 23 months after the purchase month,
    # so a range starting in 2026-09 must still read purchases from 2024-10 on.
    first_day = _manual(api, "Café", "2024-10-01", amount_cents=240000, instalment_count=24)
    last_day = _manual(api, "Café", "2024-10-31", amount_cents=240000, instalment_count=24)
    _manual(api, "Café", "2024-09-30", amount_cents=240000, instalment_count=24)

    rows = _manual_entries(api, "2026-09", "2026-09")

    assert sorted((r["id"], r["date"]) for r in rows) == sorted(
        [
            (f"manual:{first_day['id']}:24", "2026-09-01"),
            (f"manual:{last_day['id']}:24", "2026-09-30"),
        ]
    )
    assert {(r["instalment_number"], r["instalment_count"]) for r in rows} == {(24, 24)}
    # The plan bought a month earlier ended in August.
    august = _manual_entries(api, "2026-08", "2026-08")
    assert len(august) == 3
    assert {r["instalment_number"] for r in august} == {23, 24}


def test_reducing_the_count_removes_later_rows(api: TestClient) -> None:
    created = _manual(api, "Café", "2026-03-10", amount_cents=100000, instalment_count=10)
    response = api.patch(
        f"{EXPENSES}/{created['id']}",
        json={
            "spent_on": "2026-03-10",
            "amount_cents": 100000,
            "type_id": created["type_id"],
            "description": "x",
            "trip": None,
            "instalment_count": 1,
        },
        headers={"If-Match": f'"{created["version"]}"'},
    )
    assert response.status_code == 200, response.text

    assert _manual_entries(api, "2026-04", "2026-04") == []
    (march,) = _manual_entries(api, "2026-03", "2026-03")
    assert march["id"] == f"manual:{created['id']}"
    assert march["instalment_number"] is None
    assert march["instalment_count"] is None


def test_single_payment_entries_are_unchanged(api: TestClient) -> None:
    created = _manual(api, "Café", "2026-03-10")

    (row,) = _manual_entries(api, "2026-03", "2026-03")

    assert row["id"] == f"manual:{created['id']}"
    assert row["instalment_number"] is None
    assert row["instalment_count"] is None
    assert row["amount_cents"] == 2500
