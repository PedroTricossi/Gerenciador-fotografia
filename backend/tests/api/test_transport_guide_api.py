import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select

from gerenciador.db.models import Expense, ExpenseType
from gerenciador.db.session import create_session_factory

URL = "/api/v1/transport-guide"
EXPENSES = "/api/v1/expenses"
TYPES = "/api/v1/expense-types"
CONTRACTS = "/api/v1/contracts"
TODAY = "2026-10-20"
Payload = Callable[..., dict[str, Any]]


def _type_id(api: TestClient, name: str) -> str:
    rows = api.get(TYPES, params={"include_archived": True}).json()
    return next(row["id"] for row in rows if row["name"] == name)


def _contract(
    api: TestClient, payload: Payload, catalog: dict[str, str], day: int
) -> dict[str, Any]:
    body = payload(
        event={"date": f"2026-09-{day:02d}", "venue_name": "Igreja", "venue_address": "Rua A"},
        photographer_count=1,
        payment={"items": [{"service_id": catalog["ceremony"], "amount_cents": 99000}]},
        instalments=[{"month": "2026-09", "amount_cents": 99000}],
    )
    response = api.post(CONTRACTS, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _leg(
    api: TestClient,
    contract: dict[str, Any],
    amount: int,
    distance: int,
    *,
    spent_on: str = "2026-09-10",
    left_home_at: str = "13:30",
    transport_kind: str = "ride_app",
) -> None:
    response = api.post(
        EXPENSES,
        json={
            "spent_on": spent_on,
            "amount_cents": amount,
            "type_id": _type_id(api, "Transporte"),
            "description": None,
            "trip": {
                "contract_id": contract["id"],
                "event_kind": "wedding",
                "transport_kind": transport_kind,
                "left_home_at": left_home_at,
                "distance_tenths": distance,
            },
        },
    )
    assert response.status_code == 201, response.text


def _guide(api: TestClient, **params: Any) -> dict[str, Any]:
    response = api.get(URL, params={"today": TODAY, **params})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def _bare_leg(
    engine: Engine, contract: dict[str, Any], amount: int, type_key: str = "transport"
) -> None:
    """A leg with no distance, which the API itself would not accept."""
    now = dt.datetime.now(dt.UTC)
    with create_session_factory(engine)() as session:
        type_id = session.scalars(select(ExpenseType.id).where(ExpenseType.key == type_key)).one()
        session.add(
            Expense(
                id=str(uuid.uuid4()),
                spent_on=dt.date(2026, 9, 10),
                amount_cents=amount,
                type_id=type_id,
                contract_id=contract["id"],
                event_kind="wedding",
                version=1,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()


def test_a_return_leg_without_distance_joins_the_outbound_trip(
    api: TestClient, engine: Engine, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, 10)
    _leg(api, contract, 4300, 320)
    _bare_leg(engine, contract, 4300)

    body = _guide(api, distance_tenths=320)

    assert body["trips_total"] == 1
    assert body["typical_cents"] is None
    assert body["min_cents"] is None
    assert body["max_cents"] is None
    [trip] = body["similar"]
    assert trip["cost_cents"] == 8600
    assert trip["distance_tenths"] == 320
    assert trip["left_home_at"] == "13:30"
    assert trip["transport_kind"] == "ride_app"
    assert trip["event_kind"] == "wedding"
    assert trip["date"] == "2026-09-10"
    assert trip["contract_id"] == contract["id"]
    assert trip["contract_deleted"] is False
    assert trip["groom_name"] == "João da Silva"
    assert trip["bride_name"] == "Maria Souza"


def test_enough_similar_trips_give_a_typical_cost(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    for day, (amount, distance) in zip(
        (10, 11, 12, 13), ((8600, 320), (7000, 300), (8000, 310), (9000, 340)), strict=True
    ):
        _leg(api, _contract(api, payload, catalog, day), amount, distance)

    body = _guide(api, distance_tenths=320)

    assert body["trips_total"] == 4
    assert len(body["similar"]) == 4
    assert body["typical_cents"] == 8300
    assert body["min_cents"] == 7000
    assert body["max_cents"] == 9000


def test_no_distance_asked_means_no_similar_trips(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    _leg(api, _contract(api, payload, catalog, 10), 8600, 320)

    body = _guide(api)

    assert body["trips_total"] == 1
    assert body["similar"] == []


def test_a_leg_after_today_is_excluded(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, 10)
    _leg(api, contract, 4300, 320, spent_on="2026-10-21")

    assert _guide(api, distance_tenths=320)["trips_total"] == 0


def test_unlinked_and_non_transport_expenses_are_ignored(
    api: TestClient, engine: Engine, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, 10)
    _bare_leg(engine, contract, 5000, type_key="transport")  # no distance: not a trip
    response = api.post(
        EXPENSES,
        json={
            "spent_on": "2026-09-10",
            "amount_cents": 3000,
            "type_id": _type_id(api, "Transporte"),
            "description": "Táxi avulso",
            "trip": None,
        },
    )
    assert response.status_code == 201, response.text
    now = dt.datetime.now(dt.UTC)
    with create_session_factory(engine)() as session:
        other = session.scalars(select(ExpenseType).where(ExpenseType.key.is_(None))).first()
        assert other is not None
        session.add(
            Expense(
                id=str(uuid.uuid4()),
                spent_on=dt.date(2026, 9, 10),
                amount_cents=2500,
                type_id=other.id,
                contract_id=contract["id"],
                event_kind="wedding",
                distance_tenths=320,
                version=1,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()

    assert _guide(api, distance_tenths=320)["trips_total"] == 0


def test_a_deleted_contract_still_counts_without_names(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, 10)
    _leg(api, contract, 8600, 320)
    response = api.delete(
        f"{CONTRACTS}/{contract['id']}", headers={"If-Match": f'"{contract["version"]}"'}
    )
    assert response.status_code == 204, response.text

    body = _guide(api, distance_tenths=320)

    assert body["trips_total"] == 1
    [trip] = body["similar"]
    assert trip["contract_deleted"] is True
    assert trip["groom_name"] is None
    assert trip["bride_name"] is None


@pytest.mark.parametrize(
    "params",
    [
        {"today": TODAY, "distance_tenths": 0},
        {"today": TODAY, "distance_tenths": 50001},
        {"today": TODAY, "left_home_at": "25:00"},
        {"distance_tenths": 320},
        {"today": "not-a-date"},
    ],
)
def test_invalid_query_is_rejected(api: TestClient, params: dict[str, Any]) -> None:
    assert api.get(URL, params=params).status_code == 422
