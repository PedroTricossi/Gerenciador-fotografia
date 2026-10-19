from typing import Any

from fastapi.testclient import TestClient

URL = "/api/v1/fixed-costs"
TYPES = "/api/v1/expense-types"
AUDIT = "/api/v1/audit-events"


def _type_id(api: TestClient, name: str) -> str:
    rows = api.get(TYPES, params={"include_archived": True}).json()
    return next(row["id"] for row in rows if row["name"] == name)


def _body(api: TestClient, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "Adobe",
        "type_id": _type_id(api, "Café"),
        "day_of_month": 3,
        "start_month": "2026-05",
        "amount_cents": 12400,
    }
    body.update(overrides)
    return body


def _create(api: TestClient, **overrides: Any) -> dict[str, Any]:
    response = api.post(URL, json=_body(api, **overrides))
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def _fields(response: Any) -> list[str]:
    return [error["field"] for error in response.json()["errors"]]


def _events(api: TestClient, prefix: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = api.get(AUDIT).json()["items"]
    return [e for e in items if e["action"].startswith(prefix)]


def test_create_returns_the_first_price(api: TestClient) -> None:
    response = api.post(URL, json=_body(api))
    assert response.status_code == 201
    body = response.json()
    assert body["prices"] == [{"from_month": "2026-05", "amount_cents": 12400}]
    assert body["version"] == 1
    assert body["end_month"] is None
    assert response.headers["ETag"] == '"1"'
    listed = api.get(URL).json()
    assert [row["name"] for row in listed] == ["Adobe"]
    assert listed[0]["type_name"] == "Café"
    created = _events(api, "fixed_cost.created")
    assert created[0]["details"] == {"version": 1}


def test_list_is_ordered_by_name(api: TestClient) -> None:
    _create(api, name="zeta")
    _create(api, name="Álamo")
    assert [row["name"] for row in api.get(URL).json()] == ["Álamo", "zeta"]


def test_set_price_adds_then_replaces_in_place(api: TestClient) -> None:
    cost = _create(api)
    added = api.post(
        f"{URL}/{cost['id']}/prices", json={"from_month": "2026-10", "amount_cents": 13900}
    )
    assert added.status_code == 200
    assert added.json()["version"] == 2
    assert added.headers["ETag"] == '"2"'
    assert added.json()["prices"] == [
        {"from_month": "2026-05", "amount_cents": 12400},
        {"from_month": "2026-10", "amount_cents": 13900},
    ]
    replaced = api.post(
        f"{URL}/{cost['id']}/prices", json={"from_month": "2026-10", "amount_cents": 14000}
    )
    assert replaced.json()["prices"] == [
        {"from_month": "2026-05", "amount_cents": 12400},
        {"from_month": "2026-10", "amount_cents": 14000},
    ]
    events = _events(api, "fixed_cost.price_set")
    assert sorted(e["details"]["version"] for e in events) == [2, 3]
    assert all(e["details"]["from_month"] == "2026-10" for e in events)


def test_price_before_start_month_is_refused(api: TestClient) -> None:
    cost = _create(api)
    response = api.post(
        f"{URL}/{cost['id']}/prices", json={"from_month": "2026-04", "amount_cents": 100}
    )
    assert response.status_code == 422
    assert "from_month" in _fields(response)


def test_bad_month_is_refused(api: TestClient) -> None:
    assert api.post(URL, json=_body(api, start_month="2026-13")).status_code == 422


def test_stop_and_resume(api: TestClient) -> None:
    cost = _create(api)
    stopped = api.post(f"{URL}/{cost['id']}/stop", json={"end_month": "2026-12"})
    assert stopped.status_code == 200
    assert stopped.json()["end_month"] == "2026-12"
    assert api.post(f"{URL}/{cost['id']}/stop", json={"end_month": "2026-12"}).status_code == 409
    resumed = api.post(f"{URL}/{cost['id']}/resume")
    assert resumed.status_code == 200
    assert resumed.json()["end_month"] is None
    assert api.post(f"{URL}/{cost['id']}/resume").status_code == 409
    assert _events(api, "fixed_cost.stopped")[0]["details"] == {
        "end_month": "2026-12",
        "version": 2,
    }
    assert _events(api, "fixed_cost.resumed")[0]["details"] == {"version": 3}


def test_end_month_before_start_is_refused(api: TestClient) -> None:
    cost = _create(api)
    response = api.post(f"{URL}/{cost['id']}/stop", json={"end_month": "2026-04"})
    assert response.status_code == 422
    assert "end_month" in _fields(response)


def test_rename_needs_the_current_version(api: TestClient) -> None:
    cost = _create(api)
    path = f"{URL}/{cost['id']}"
    assert api.patch(path, json={"name": "Figma"}).status_code == 428
    stale = api.patch(path, json={"name": "Figma"}, headers={"If-Match": '"9"'})
    assert stale.status_code == 412
    ok = api.patch(path, json={"name": "Figma"}, headers={"If-Match": '"1"'})
    assert ok.status_code == 200
    assert ok.json()["name"] == "Figma"
    assert ok.json()["version"] == 2
    assert _events(api, "fixed_cost.renamed")[0]["details"] == {"version": 2}


def test_delete(api: TestClient) -> None:
    cost = _create(api)
    path = f"{URL}/{cost['id']}"
    assert api.delete(path).status_code == 428
    assert api.delete(path, headers={"If-Match": '"3"'}).status_code == 412
    assert api.delete(path, headers={"If-Match": '"1"'}).status_code == 204
    assert api.get(URL).json() == []
    assert api.delete(path, headers={"If-Match": '"1"'}).status_code == 404
    assert _events(api, "fixed_cost.deleted")[0]["details"] == {"version": 1}


def test_unknown_cost_is_404(api: TestClient) -> None:
    missing = "00000000-0000-4000-8000-000000000000"
    assert api.post(f"{URL}/{missing}/resume").status_code == 404
    assert api.post(f"{URL}/{missing}/stop", json={"end_month": "2026-12"}).status_code == 404


def test_type_must_be_active_and_not_second_photographer(api: TestClient) -> None:
    second = api.post(URL, json=_body(api, type_id=_type_id(api, "2º fotógrafo")))
    assert second.status_code == 422
    assert "type_id" in _fields(second)
    cafe = _type_id(api, "Café")
    assert api.post(f"/api/v1/expense-types/{cafe}/archive").status_code == 200
    archived = api.post(URL, json=_body(api, type_id=cafe))
    assert archived.status_code == 422
    assert "type_id" in _fields(archived)


def test_audit_holds_no_names_or_amounts(api: TestClient) -> None:
    cost = _create(api, name="Segredo", amount_cents=98765)
    api.post(f"{URL}/{cost['id']}/prices", json={"from_month": "2026-10", "amount_cents": 98766})
    text = str(_events(api, "fixed_cost."))
    assert "Segredo" not in text
    assert "98765" not in text
    assert "98766" not in text


def test_name_allows_100_characters_and_refuses_101(api: TestClient) -> None:
    cost = _create(api, name="a" * 100)
    too_long = api.post(URL, json=_body(api, name="a" * 101))
    assert too_long.status_code == 422
    assert "name" in _fields(too_long)
    path = f"{URL}/{cost['id']}"
    ok = api.patch(path, json={"name": "b" * 100}, headers={"If-Match": '"1"'})
    assert ok.status_code == 200
    refused = api.patch(path, json={"name": "b" * 101}, headers={"If-Match": '"2"'})
    assert refused.status_code == 422
    assert "name" in _fields(refused)
