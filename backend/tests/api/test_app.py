from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"
PROBLEM = "application/problem+json"


def _is_problem(response: Response, status: int) -> dict[str, Any]:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert set(body) >= {"type", "title", "status", "detail", "request_id"}
    return body


def test_health(api: TestClient) -> None:
    response = api.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_every_response_has_a_fresh_request_id(api: TestClient) -> None:
    first = api.get("/api/v1/health", headers={"X-Request-ID": "client-chosen"})
    second = api.get("/api/v1/health")
    assert UUID(first.headers["X-Request-ID"])
    assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]


def test_api_security_headers(api: TestClient) -> None:
    headers = api.get("/api/v1/health").headers
    assert headers["Cache-Control"] == "no-store"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "no-referrer"
    assert headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_docs_page_can_load_its_assets(api: TestClient) -> None:
    response = api.get("/docs")
    assert response.status_code == 200
    assert "https://cdn.jsdelivr.net" in response.headers["Content-Security-Policy"]


@pytest.mark.parametrize("host", ["evil.example", "192.168.0.10:8000", "127.0.0.1.evil.example"])
def test_unknown_host_is_rejected(api: TestClient, host: str) -> None:
    body = _is_problem(api.get("/api/v1/health", headers={"Host": host}), 400)
    assert UUID(body["request_id"])


@pytest.mark.parametrize("host", ["localhost:8000", "127.0.0.1", "localhost"])
def test_loopback_hosts_are_accepted(api: TestClient, host: str) -> None:
    assert api.get("/api/v1/health", headers={"Host": host}).status_code == 200


def test_write_without_origin_is_rejected(api: TestClient) -> None:
    del api.headers["Origin"]
    _is_problem(api.post("/api/v1/health"), 403)


@pytest.mark.parametrize(
    "origin", ["http://evil.example", "https://127.0.0.1:8000", "http://127.0.0.1:9999", "null"]
)
def test_write_from_another_origin_is_rejected(api: TestClient, origin: str) -> None:
    _is_problem(api.post("/api/v1/health", headers={"Origin": origin}), 403)


def test_write_with_a_non_json_body_is_rejected(api: TestClient) -> None:
    response = api.post(
        "/api/v1/health",
        content="a=1",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    _is_problem(response, 415)


def test_http_errors_are_problems(api: TestClient) -> None:
    _is_problem(api.get("/api/v1/nope"), 404)
    _is_problem(api.post("/api/v1/health"), 405)


def test_unhandled_errors_reveal_nothing(settings: Settings) -> None:
    app = create_app(settings)

    def boom() -> None:
        raise RuntimeError("secret detail 12345678909")

    app.add_api_route("/api/v1/boom", boom)
    with TestClient(app, base_url=BASE_URL, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/boom")
    body = _is_problem(response, 500)
    assert "secret" not in response.text
    assert "12345678909" not in response.text
    assert UUID(body["request_id"])
