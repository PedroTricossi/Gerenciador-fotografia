from collections.abc import Callable
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

URL = "/api/v1/contracts"
PROBLEM = "application/problem+json"
BODY = {"date": "2027-01-20", "venue_name": "Parque Barigui", "start_time": "16:00"}
Payload = Callable[..., dict[str, Any]]


def _contract(
    api: TestClient,
    payload: Payload,
    catalog: dict[str, str],
    *,
    prewedding_item: bool = True,
    **overrides: Any,
) -> dict[str, Any]:
    items = [{"service_id": catalog["ceremony"], "amount_cents": 120000}]
    if prewedding_item:
        items.append({"service_id": catalog["prewedding"], "amount_cents": 80000})
    response = api.post(URL, json=payload(payment={"items": items}, **overrides))
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _url(contract: dict[str, Any]) -> str:
    return f"{URL}/{contract['id']}/prewedding"


def test_schedule_change_and_cancel(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    url = _url(contract)

    created = api.put(url, json=BODY)
    assert created.status_code == 201
    assert created.headers["ETag"] == '"1"'
    assert created.json() == {
        "date": "2027-01-20",
        "venue_name": "Parque Barigui",
        "venue_address": None,
        "start_time": "16:00:00",
        "version": 1,
    }
    read = api.get(url)
    assert (read.status_code, read.headers["ETag"], read.json()) == (
        200,
        '"1"',
        created.json(),
    )

    missing = api.put(url, json=BODY)
    assert missing.status_code == 428
    assert missing.headers["content-type"] == PROBLEM
    stale = api.put(url, json=BODY, headers={"If-Match": '"9"'})
    assert stale.status_code == 412
    assert stale.json()["detail"] == "The prewedding changed since it was loaded"

    changed = api.put(url, json={**BODY, "venue_name": "Jardim"}, headers={"If-Match": '"1"'})
    assert (changed.status_code, changed.headers["ETag"]) == (200, '"2"')
    assert changed.json()["venue_name"] == "Jardim"

    assert api.delete(url).status_code == 428
    assert api.delete(url, headers={"If-Match": '"1"'}).status_code == 412
    assert api.delete(url, headers={"If-Match": '"2"'}).status_code == 204
    gone = api.get(url)
    assert (gone.status_code, gone.json()["detail"]) == (
        404,
        "pré-wedding não agendado",
    )

    assert api.get(f"{URL}/{contract['id']}").json()["version"] == 1


def test_the_first_schedule_ignores_if_match(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    response = api.put(_url(contract), json=BODY, headers={"If-Match": "garbage"})
    assert response.status_code == 201


def test_ineligible_missing_and_deleted_contracts(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    plain = _contract(api, payload, catalog, prewedding_item=False)
    refused = api.put(_url(plain), json=BODY)
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "este contrato não inclui pré-wedding",
    )

    missing = f"{URL}/{uuid4()}/prewedding"
    for response in (
        api.get(missing),
        api.put(missing, json=BODY),
        api.delete(missing, headers={"If-Match": '"1"'}),
    ):
        assert (response.status_code, response.json()["detail"]) == (
            404,
            "contrato não encontrado",
        )

    deleted = _contract(api, payload, catalog)
    assert api.delete(f"{URL}/{deleted['id']}").status_code == 204
    assert api.put(_url(deleted), json=BODY).status_code == 404
    assert api.get(f"{URL}/not-a-uuid/prewedding").status_code == 422


def test_validation(api: TestClient, payload: Payload, catalog: dict[str, str]) -> None:
    url = _url(_contract(api, payload, catalog))
    no_place = api.put(url, json={"date": "2027-01-20"})
    assert no_place.status_code == 422
    assert [e["field"] for e in no_place.json()["errors"]] == ["venue_name"]
    assert api.put(url, json={**BODY, "notes": "x"}).status_code == 422

    blanks = api.put(url, json={**BODY, "venue_address": " ", "start_time": ""})
    assert blanks.status_code == 201
    assert (blanks.json()["venue_address"], blanks.json()["start_time"]) == (None, None)


def test_create_a_contract_with_its_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, prewedding=BODY)
    assert contract["has_prewedding"] is True
    assert contract["prewedding"]["venue_name"] == "Parque Barigui"
    assert contract["prewedding"]["version"] == 1

    refused = api.post(URL, json=payload(prewedding=BODY))
    assert refused.status_code == 422
    assert refused.json()["errors"] == [
        {"field": "prewedding", "message": "inclua um serviço de pré-wedding"}
    ]


def test_removing_the_item_needs_cancel_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, prewedding=BODY)
    url = f"{URL}/{contract['id']}"
    only_ceremony = {
        "payment": {"items": [{"service_id": catalog["ceremony"], "amount_cents": 120000}]}
    }

    refused = api.patch(url, json=only_ceremony, headers={"If-Match": '"1"'})
    assert refused.status_code == 409
    assert refused.json()["code"] == "prewedding_scheduled"

    saved = api.patch(
        url,
        json={**only_ceremony, "cancel_prewedding": True},
        headers={"If-Match": '"1"'},
    )
    assert saved.status_code == 200
    body = saved.json()
    assert (body["version"], body["has_prewedding"], body["prewedding"]) == (
        2,
        False,
        None,
    )
    assert api.get(f"{url}/prewedding").status_code == 404


def test_cancel_prewedding_must_be_a_boolean(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog)
    response = api.patch(
        f"{URL}/{contract['id']}",
        json={"cancel_prewedding": "yes"},
        headers={"If-Match": '"1"'},
    )
    assert response.status_code == 422


def test_list_rows_carry_the_prewedding(
    api: TestClient, payload: Payload, catalog: dict[str, str]
) -> None:
    contract = _contract(api, payload, catalog, prewedding=BODY)
    row = api.get(URL).json()["items"][0]
    assert row["has_prewedding"] is True
    assert row["prewedding"]["venue_name"] == "Parque Barigui"

    assert api.delete(f"{URL}/{contract['id']}").status_code == 204
    deleted = api.get(URL, params={"include_deleted": True}).json()["items"][0]
    assert (deleted["has_prewedding"], deleted["prewedding"]) == (False, None)
