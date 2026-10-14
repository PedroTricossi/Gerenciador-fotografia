import logging
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func, select
from starlette.requests import Request

from gerenciador.api import errors as api_errors
from gerenciador.config import Settings
from gerenciador.db.models import AuditEvent
from gerenciador.main import create_app
from gerenciador.services.audit_service import AuditService

BASE_URL = "http://127.0.0.1:8000"
PROBLEM = "application/problem+json"
PERSONAL_PATH = "/api/v1/clients/João da Silva 123.456.789-09"


def _is_problem(response: Response, status: int) -> dict[str, Any]:
    assert response.status_code == status
    assert response.headers["content-type"] == PROBLEM
    body: dict[str, Any] = response.json()
    assert body["status"] == status
    assert set(body) >= {"type", "title", "status", "detail", "request_id"}
    return body


def _allow(response: Response) -> str:
    _is_problem(response, 405)
    return response.headers["Allow"]


def _assert_api_headers(response: Response, request_id: str) -> None:
    assert response.headers["X-Request-ID"] == request_id
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cache-Control"] == "no-store"
    assert (
        response.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    )


def _audit_count(api: TestClient) -> int:
    with api.app.state.session_factory() as session:
        return session.scalar(select(func.count()).select_from(AuditEvent)) or 0


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


@pytest.mark.parametrize(
    "headers",
    [
        {"Sec-Fetch-Site": "cross-site", "Origin": "http://evil.example"},
        {"Sec-Fetch-Site": "cross-site"},
        {"Sec-Fetch-Site": "same-site"},
        {"Sec-Fetch-Site": "Cross-Site"},
    ],
)
def test_cross_site_read_is_refused_and_leaves_no_audit_row(
    api: TestClient, headers: dict[str, str]
) -> None:
    response = api.get(PERSONAL_PATH, headers=headers)
    body = _is_problem(response, 403)
    _assert_api_headers(response, body["request_id"])
    assert "João" not in response.text
    assert "123.456.789-09" not in response.text
    assert _audit_count(api) == 0


@pytest.mark.parametrize("method", ["get", "head", "options", "post", "delete"])
def test_cross_site_requests_are_refused_for_every_method(api: TestClient, method: str) -> None:
    response = getattr(api, method)("/api/v1/health", headers={"Sec-Fetch-Site": "cross-site"})
    assert response.status_code == 403


@pytest.mark.parametrize("site", ["same-origin", "none"])
def test_same_origin_reads_are_allowed(api: TestClient, site: str) -> None:
    assert api.get("/api/v1/health", headers={"Sec-Fetch-Site": site}).status_code == 200


def test_read_without_origin_or_fetch_metadata_is_allowed(api: TestClient) -> None:
    del api.headers["Origin"]
    assert api.get("/api/v1/health").status_code == 200


def test_cross_site_navigation_to_the_docs_page_is_allowed(api: TestClient) -> None:
    response = api.get("/docs", headers={"Sec-Fetch-Site": "cross-site"})
    assert response.status_code == 200


def test_rejected_read_is_audited_by_route_template_not_by_path(api: TestClient) -> None:
    response = api.get(PERSONAL_PATH)
    _is_problem(response, 422)
    with api.app.state.session_factory() as session:
        event = session.scalars(select(AuditEvent)).one()
        assert event.action == "request.rejected"
        assert event.details == {
            "route": "GET /api/v1/clients/{client_id}",
            "fields": ["path.client_id"],
        }
        serialized = str(event.details)
    for needle in ("João", "Silva", "123.456.789-09", "12345678909"):
        assert needle not in serialized


@pytest.mark.parametrize(
    ("method", "label"), [("GET", "GET unmatched"), ("JOÃO", "OTHER unmatched")]
)
def test_route_label_without_a_matched_route_never_uses_caller_text(
    method: str, label: str
) -> None:
    request = Request({"type": "http", "method": method, "path": "/João 12345678909"})
    assert api_errors._route_label(request) == label


def test_redoc_is_not_served(api: TestClient) -> None:
    _is_problem(api.get("/redoc"), 404)


def test_write_with_a_non_json_body_is_rejected(api: TestClient) -> None:
    response = api.post(
        "/api/v1/health",
        content="a=1",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    _is_problem(response, 415)


def test_http_errors_are_problems(api: TestClient) -> None:
    _is_problem(api.get("/api/v1/nope"), 404)
    assert "POST" not in _allow(api.post("/api/v1/health"))
    assert "GET" in _allow(api.post("/api/v1/health"))


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


def test_unhandled_errors_keep_security_headers(settings: Settings) -> None:
    app = create_app(settings)

    def boom() -> None:
        raise RuntimeError("secret detail 12345678909")

    app.add_api_route("/api/v1/boom", boom)
    with TestClient(app, base_url=BASE_URL, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/boom")
    body = _is_problem(response, 500)
    _assert_api_headers(response, body["request_id"])


def test_unhandled_errors_are_logged_without_detail(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    app = create_app(settings)

    def boom() -> None:
        raise RuntimeError("secret detail 12345678909")

    app.add_api_route("/api/v1/boom", boom)
    with (
        caplog.at_level(logging.ERROR, logger="gerenciador.api"),
        TestClient(app, base_url=BASE_URL, raise_server_exceptions=False) as client,
    ):
        body = client.get("/api/v1/boom").json()
    records = [r for r in caplog.records if r.name == "gerenciador.api"]
    assert len(records) == 1
    text = records[0].getMessage()
    assert body["request_id"] in text
    assert "RuntimeError" in text
    assert "12345678909" not in text
    assert records[0].exc_info is None


def test_rejections_keep_security_headers(api: TestClient) -> None:
    bad_host = api.get("/api/v1/health", headers={"Host": "evil.example"})
    bad_origin = api.post("/api/v1/health", headers={"Origin": "http://evil.example"})
    bad_body = api.post(
        "/api/v1/health",
        content="a=1",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    for response, status in ((bad_host, 400), (bad_origin, 403), (bad_body, 415)):
        body = _is_problem(response, status)
        _assert_api_headers(response, body["request_id"])


class _Nested(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = ""


class _Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    secret: str = ""
    nested: _Nested = _Nested()

    @field_validator("secret")
    @classmethod
    def _echoes_value(cls, value: str) -> str:
        if value:
            raise ValueError(f"bad {value}")
        return value


def _app_with_payload_route(settings: Settings) -> Any:
    app = create_app(settings)

    def take(payload: _Payload) -> None:
        return None

    app.add_api_route("/api/v1/take", take, methods=["POST"])
    return app


def test_unknown_keys_are_not_echoed(settings: Settings) -> None:
    app = _app_with_payload_route(settings)
    with TestClient(app, base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        response = client.post(
            "/api/v1/take", json={"12345678909": 1, "nested": {"98765432100": 2}}
        )
    body = _is_problem(response, 422)
    assert "12345678909" not in response.text
    assert "98765432100" not in response.text
    assert sorted(e["field"] for e in body["errors"]) == ["*", "nested.*"]
    with app.state.session_factory() as session:
        event = session.scalars(
            select(AuditEvent).where(AuditEvent.action == "request.rejected")
        ).one()
        assert sorted(event.details["fields"]) == ["*", "nested.*"]


def test_input_values_are_not_echoed_in_messages(settings: Settings) -> None:
    app = _app_with_payload_route(settings)
    with TestClient(app, base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        response = client.post("/api/v1/take", json={"secret": "Nome Secreto 123"})
    body = _is_problem(response, 422)
    assert "Nome Secreto 123" not in response.text
    assert body["errors"] == [{"field": "secret", "message": "valor inválido"}]


def test_failing_audit_write_still_answers_422(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def fail(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("db down 12345678909")

    monkeypatch.setattr(AuditService, "record", fail)
    app = _app_with_payload_route(settings)
    with (
        caplog.at_level(logging.ERROR, logger="gerenciador.api"),
        TestClient(app, base_url=BASE_URL) as client,
    ):
        client.headers["Origin"] = BASE_URL
        response = client.post("/api/v1/take", json={"unknown": 1})
    body = _is_problem(response, 422)
    assert body["errors"] == [{"field": "*", "message": "Extra inputs are not permitted"}]
    records = [r for r in caplog.records if r.name == "gerenciador.api"]
    assert len(records) == 1
    assert records[0].levelno == logging.ERROR
    assert body["request_id"] in records[0].getMessage()
    assert "12345678909" not in records[0].getMessage()
    assert records[0].exc_info is None
