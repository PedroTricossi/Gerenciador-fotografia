from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select

from gerenciador.db.models import ExpenseType
from gerenciador.db.session import create_session_factory

URL = "/api/v1/overview"
ENTRIES = "/api/v1/expense-entries"
EXPENSES = "/api/v1/expenses"
FIXED = "/api/v1/fixed-costs"
FEE = "/api/v1/second-photographer-fee"
TYPES = "/api/v1/expense-types"
CONTRACTS = "/api/v1/contracts"
TODAY = "2026-10-20"
Payload = Callable[..., dict[str, Any]]


def _type_id(api: TestClient, name: str) -> str:
    rows = api.get(TYPES, params={"include_archived": True}).json()
    return next(row["id"] for row in rows if row["name"] == name)


def _contract(
    api: TestClient,
    payload: Payload,
    catalog: dict[str, str],
    months: tuple[str, ...] = ("2026-09", "2026-10", "2026-11"),
    **overrides: Any,
) -> dict[str, Any]:
    body = payload(
        photographer_count=1,
        payment={
            "items": [{"service_id": catalog["ceremony"], "amount_cents": 99000 * len(months)}]
        },
        instalments=[{"month": m, "amount_cents": 99000} for m in months],
        **overrides,
    )
    response = api.post(CONTRACTS, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _pay(api: TestClient, contract: dict[str, Any], number: int, paid_on: str) -> None:
    response = api.post(
        f"{CONTRACTS}/{contract['id']}/instalments/{number}/paid", json={"paid_on": paid_on}
    )
    assert response.status_code == 200, response.text


def _expense(api: TestClient, type_name: str, spent_on: str, amount: int) -> None:
    response = api.post(
        EXPENSES,
        json={
            "spent_on": spent_on,
            "amount_cents": amount,
            "type_id": _type_id(api, type_name),
            "description": "x",
            "trip": None,
        },
    )
    assert response.status_code == 201, response.text


def _fixed(api: TestClient) -> None:
    response = api.post(
        FIXED,
        json={
            "name": "Adobe",
            "type_id": _type_id(api, "Assinatura"),
            "day_of_month": 3,
            "start_month": "2026-10",
            "amount_cents": 12400,
        },
    )
    assert response.status_code == 201, response.text


def _overview(
    api: TestClient, period: str = "month", value: str = "2026-10", today: str = TODAY
) -> dict[str, Any]:
    response = api.get(URL, params={"period": period, "value": value, "today": today})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def _expected_slots(engine: Engine) -> dict[str, int]:
    """Slot by type id: the position in (created_at, id) order, archived types included."""
    with create_session_factory(engine)() as session:
        ids = session.scalars(
            select(ExpenseType.id).order_by(ExpenseType.created_at, ExpenseType.id)
        ).all()
    return {type_id: i for i, type_id in enumerate(ids)}


@pytest.fixture
def october(api: TestClient, payload: Payload, catalog: dict[str, str]) -> dict[str, Any]:
    contract = _contract(api, payload, catalog)
    _pay(api, contract, 1, "2026-10-03")
    _fixed(api)
    _expense(api, "Café", "2026-10-14", 3800)
    _expense(api, "Café", "2026-10-25", 1000)
    return contract


def test_october_money_in_and_out(api: TestClient, engine: Engine, october: dict[str, Any]) -> None:
    body = _overview(api)

    assert body["period_start"] == "2026-10-01"
    assert body["period_end"] == "2026-10-31"
    assert body["not_started"] is False
    assert body["in_cents"] == 99000
    assert body["out_cents"] == 16200
    assert [(t["type_name"], t["amount_cents"]) for t in body["by_type"]] == [
        ("Assinatura", 12400),
        ("Café", 3800),
    ]
    slots = {t["type_name"]: t["palette_slot"] for t in body["by_type"]}
    assert slots == {
        "Assinatura": _expected_slots(engine)[_type_id(api, "Assinatura")],
        "Café": _expected_slots(engine)[_type_id(api, "Café")],
    }
    rows = body["statement"]
    assert [(r["kind"], r["date"]) for r in rows] == [
        ("in", "2026-10-03"),
        ("out", "2026-10-03"),
        ("out", "2026-10-14"),
    ]
    assert rows[0]["number"] == 1
    assert rows[0]["count"] == 3
    assert rows[0]["groom_name"] == "João da Silva"
    assert rows[0]["contract_deleted"] is False
    assert rows[1]["entry"]["description"] == "Adobe"
    assert body["opening_cents"] == 0
    assert body["free_today_cents"] == 82800
    assert body["missing_fee_count"] == 0


def test_statement_closes_on_the_free_balance(api: TestClient, october: dict[str, Any]) -> None:
    body = _overview(api)

    ins = sum(r["amount_cents"] for r in body["statement"] if r["kind"] == "in")
    outs = sum(r["amount_cents"] for r in body["statement"] if r["kind"] == "out")
    assert body["opening_cents"] + ins - outs == body["free_today_cents"]


def test_out_agrees_with_despesas(api: TestClient, october: dict[str, Any]) -> None:
    entries = api.get(ENTRIES, params={"from": "2026-10", "to": "2026-10"}).json()["entries"]

    expected = sum(e["amount_cents"] for e in entries if e["date"] <= TODAY)

    assert _overview(api)["out_cents"] == expected


def test_year_view_and_not_started(api: TestClient, october: dict[str, Any]) -> None:
    _expense(api, "Café", "2026-03-02", 700)

    year = _overview(api, "year", "2026")
    assert year["period_start"] == "2026-01-01"
    assert year["out_cents"] == 16200 + 700
    assert year["in_cents"] == 99000
    assert year["opening_cents"] == 0
    november = _overview(api, "month", "2026-11")
    assert november["opening_cents"] == 99000 - 16900
    december = _overview(api, "month", "2026-12")
    assert december["not_started"] is True
    assert december["in_cents"] == 0
    assert december["out_cents"] == 0
    assert december["statement"] == []


def test_upcoming_months_carry_the_balance(api: TestClient, october: dict[str, Any]) -> None:
    body = _overview(api)

    first, second, third, fourth = body["upcoming"][:4]
    assert first["month"] == "2026-10"
    assert first["rest_of_month"] is True
    assert first["in_cents"] == 99000
    assert first["out_cents"] == 1000
    assert first["projected_free_cents"] == 82800 + 99000 - 1000
    assert [r["month"] for r in (second, third, fourth)] == ["2026-11", "2026-12", "2027-01"]
    assert all(r["rest_of_month"] is False for r in (second, third, fourth))
    assert second["in_cents"] == 99000
    assert second["out_cents"] == 12400
    assert second["projected_free_cents"] == first["projected_free_cents"] + 99000 - 12400


def test_late_instalments_only_in_late(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, months=("2026-08", "2026-10", "2026-11"))

    body = _overview(api)

    assert body["late_cents"] == 99000
    assert [r["month"] for r in body["upcoming"]] == ["2026-10", "2026-11", "2026-12", "2027-01"]
    assert [r["in_cents"] for r in body["upcoming"]] == [99000, 99000, 0, 0]
    assert body["in_cents"] == 0
    # Paying the late one moves it out of late; it is money in on the payment day.
    _pay(api, contract, 1, "2026-10-02")
    paid = _overview(api)
    assert paid["late_cents"] == 0
    assert paid["in_cents"] == 99000


def test_upcoming_reaches_the_last_unpaid_month(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    _contract(api, payload, catalog, months=("2026-10", "2027-03", "2027-05"))

    upcoming = _overview(api)["upcoming"]

    assert [r["month"] for r in upcoming] == [
        "2026-10",
        "2026-11",
        "2026-12",
        "2027-01",
        "2027-02",
        "2027-03",
        "2027-04",
        "2027-05",
    ]
    assert [r["in_cents"] for r in upcoming] == [99000, 0, 0, 0, 0, 99000, 0, 99000]
    assert upcoming[-1]["projected_free_cents"] == 3 * 99000


def test_a_future_payment_counts_in_the_month_it_is_paid(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, months=("2026-10", "2026-11", "2027-02"))
    # Due 2026-11, but paid in December; due 2026-10, paid later this month.
    _pay(api, contract, 2, "2026-12-05")
    _pay(api, contract, 1, "2026-10-28")

    body = _overview(api)

    assert body["in_cents"] == 0
    assert body["free_today_cents"] == 0
    by_month = {r["month"]: r for r in body["upcoming"]}
    assert by_month["2026-10"]["in_cents"] == 99000
    assert by_month["2026-10"]["rest_of_month"] is True
    assert by_month["2026-11"]["in_cents"] == 0
    assert by_month["2026-12"]["in_cents"] == 99000
    assert by_month["2027-02"]["in_cents"] == 99000


def test_deleted_contract(api: TestClient, october: dict[str, Any]) -> None:
    response = api.delete(
        f"{CONTRACTS}/{october['id']}", headers={"If-Match": f'"{october["version"]}"'}
    )
    assert response.status_code == 204, response.text

    body = _overview(api)

    assert body["in_cents"] == 99000
    row = body["statement"][0]
    assert row["kind"] == "in"
    assert row["contract_deleted"] is True
    assert row["groom_name"] is None
    assert row["bride_name"] is None
    assert body["late_cents"] == 0
    assert all(r["in_cents"] == 0 for r in body["upcoming"])


def test_missing_fee_counts_and_adds_nothing(api: TestClient, payload: Payload) -> None:
    body = payload(event={"date": "2026-10-11", "venue_name": "Igreja", "venue_address": "Rua A"})
    assert api.post(CONTRACTS, json=body).status_code == 201

    result = _overview(api)

    assert result["missing_fee_count"] == 1
    assert result["out_cents"] == 0
    assert result["by_type"] == []


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"period": "month", "value": "2026-13", "today": TODAY}, "value"),
        ({"period": "week", "value": "2026-10", "today": TODAY}, "period"),
        ({"period": "month", "value": "2026-10", "today": "20-10-2026"}, "today"),
    ],
)
def test_bad_input_is_rejected_on_its_field(
    api: TestClient, params: dict[str, str], field: str
) -> None:
    response = api.get(URL, params=params)

    assert response.status_code == 422
    assert field in response.text


def test_palette_slots_follow_creation_order(
    api: TestClient, engine: Engine, october: dict[str, Any]
) -> None:
    for i in range(4):
        assert api.post(TYPES, json={"name": f"Novo {i}"}).status_code == 201
    expected = _expected_slots(engine)
    assert len(expected) >= 10
    for name in ("Transporte", "Equipamento", "Outro", *(f"Novo {i}" for i in range(4))):
        _expense(api, name, "2026-10-10", 100)
    archived = _type_id(api, "Equipamento")
    assert api.post(f"{TYPES}/{archived}/archive").status_code == 200

    shares = {t["type_id"]: t["palette_slot"] for t in _overview(api)["by_type"]}

    assert len(shares) == 9
    assert shares == {
        type_id: (expected[type_id] if expected[type_id] < 8 else None) for type_id in shares
    }
    assert shares[archived] == (expected[archived] if expected[archived] < 8 else None)
    assert None in shares.values()
    assert any(slot is not None for slot in shares.values())


def test_month_totals_sum_to_the_purchase_total(api: TestClient) -> None:
    response = api.post(
        EXPENSES,
        json={
            "spent_on": "2026-01-15",
            "amount_cents": 100000,
            "type_id": _type_id(api, "Café"),
            "description": "x",
            "trip": None,
            "instalment_count": 7,
        },
    )
    assert response.status_code == 201, response.text

    months = [f"2026-{m:02d}" for m in range(1, 8)]
    outs = [_overview(api, "month", m, today="2027-01-01")["out_cents"] for m in months]

    assert sum(outs) == 100000
    assert outs[:-1] == [14285] * 6
    assert outs[-1] == 14290
