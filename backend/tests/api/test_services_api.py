from typing import Any

import pytest
from fastapi.testclient import TestClient

URL = "/api/v1/services"
PROBLEM = "application/problem+json"
MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"


def _create(api: TestClient, **overrides: Any) -> dict[str, Any]:
    body = {
        "name": "Álbum",
        "default_price_cents": 150000,
        "is_prewedding": False,
        **overrides,
    }
    response = api.post(URL, json=body)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def test_create_returns_the_service(api: TestClient) -> None:
    response = api.post(
        URL,
        json={
            "name": "  Ensaio de pré-wedding ",
            "default_price_cents": 80000,
            "is_prewedding": True,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    assert response.headers["ETag"] == '"1"'
    assert body == {
        "id": body["id"],
        "name": "Ensaio de pré-wedding",
        "default_price_cents": 80000,
        "is_prewedding": True,
        "archived_at": None,
        "version": 1,
    }


def test_is_prewedding_defaults_to_false(api: TestClient) -> None:
    response = api.post(URL, json={"name": "Moldura", "default_price_cents": 1000})
    assert response.json()["is_prewedding"] is False


def test_list_is_a_sorted_array_and_hides_archived(api: TestClient) -> None:
    _create(api, name="diária")
    _create(api, name="Álbum")
    archived = _create(api, name="Antigo")
    assert api.post(f"{URL}/{archived['id']}/archive").status_code == 200

    assert [s["name"] for s in api.get(URL).json()] == ["Álbum", "diária"]
    assert [s["name"] for s in api.get(URL, params={"include_archived": True}).json()] == [
        "Álbum",
        "Antigo",
        "diária",
    ]


def test_get_one_with_etag(api: TestClient) -> None:
    created = _create(api)
    response = api.get(f"{URL}/{created['id']}")
    assert response.status_code == 200
    assert response.headers["ETag"] == '"1"'
    assert response.json() == created


def test_patch_needs_if_match_and_checks_it(api: TestClient) -> None:
    created = _create(api)
    url = f"{URL}/{created['id']}"
    assert api.patch(url, json={"name": "Outro"}).status_code == 428
    stale = api.patch(url, json={"name": "Outro"}, headers={"If-Match": '"9"'})
    assert stale.status_code == 412
    assert stale.json()["detail"] == "The service changed since it was loaded"

    response = api.patch(url, json={"default_price_cents": 175000}, headers={"If-Match": '"1"'})
    assert response.status_code == 200
    assert response.headers["ETag"] == '"2"'
    assert response.json()["default_price_cents"] == 175000
    assert response.json()["name"] == "Álbum"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({}, ""),
        ({"name": ""}, "name"),
        ({"name": "x" * 201}, "name"),
        ({"name": "Á\x00lbum"}, "name"),
        ({"default_price_cents": 0}, "default_price_cents"),
        ({"default_price_cents": 100_000_001}, "default_price_cents"),
        ({"is_prewedding": "sim"}, "is_prewedding"),
        ({"color": "azul"}, "*"),
    ],
)
def test_patch_validation(api: TestClient, body: dict[str, Any], field: str) -> None:
    created = _create(api)
    response = api.patch(f"{URL}/{created['id']}", json=body, headers={"If-Match": '"1"'})
    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM
    assert field in [error["field"] for error in response.json()["errors"]]


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"default_price_cents": 1000}, "name"),
        ({"name": "Álbum"}, "default_price_cents"),
        ({"name": "Álbum", "default_price_cents": 10.5}, "default_price_cents"),
        (
            {"name": "Álbum", "default_price_cents": 1000, "is_prewedding": 1},
            "is_prewedding",
        ),
    ],
)
def test_create_validation(api: TestClient, body: dict[str, Any], field: str) -> None:
    response = api.post(URL, json=body)
    assert response.status_code == 422
    assert field in [error["field"] for error in response.json()["errors"]]


def test_name_conflicts_are_409(api: TestClient) -> None:
    first = _create(api)
    assert api.post(URL, json={"name": "ÁLBUM", "default_price_cents": 1}).status_code == 409
    api.post(f"{URL}/{first['id']}/archive")
    _create(api, name="álbum")
    restore = api.post(f"{URL}/{first['id']}/restore")
    assert restore.status_code == 409
    assert restore.headers["content-type"] == PROBLEM


def test_archive_and_restore(api: TestClient) -> None:
    created = _create(api)
    archived = api.post(f"{URL}/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.headers["ETag"] == '"2"'
    assert archived.json()["archived_at"] is not None
    assert api.post(f"{URL}/{created['id']}/archive").status_code == 409
    restored = api.post(f"{URL}/{created['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None
    assert api.post(f"{URL}/{created['id']}/restore").status_code == 409


@pytest.mark.parametrize(
    ("method", "suffix"),
    [("get", ""), ("post", "/archive"), ("post", "/restore")],
)
def test_unknown_service_is_404(api: TestClient, method: str, suffix: str) -> None:
    response = getattr(api, method)(f"{URL}/{MISSING}{suffix}")
    assert response.status_code == 404
    assert response.headers["content-type"] == PROBLEM


def test_a_service_made_through_the_api_can_be_used_in_a_contract(
    api: TestClient, payload: Any
) -> None:
    service = _create(api, name="Drone", default_price_cents=40000)
    body = payload()
    body["payment"]["items"].append({"service_id": service["id"], "amount_cents": 45000})
    body["instalments"][0]["amount_cents"] += 45000  # the plan follows the total
    response = api.post("/api/v1/contracts", json=body)
    assert response.status_code == 201
    assert response.json()["payment"]["items"][-1] == {
        "service_id": service["id"],
        "description": "Drone",
        "amount_cents": 45000,
    }
