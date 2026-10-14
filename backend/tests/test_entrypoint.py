from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from gerenciador import __main__ as entrypoint
from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"


def test_main_runs_uvicorn_on_the_configured_loopback_address(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(entrypoint, "get_settings", lambda: settings)
    monkeypatch.setattr(
        entrypoint.uvicorn, "run", lambda app, **kwargs: calls.append({"app": app, **kwargs})
    )
    entrypoint.main()
    assert calls == [
        {"app": "gerenciador.main:create_app", "factory": True, "host": "127.0.0.1", "port": 8000}
    ]


def test_built_frontend_is_served_with_a_strict_csp(settings: Settings, tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>app</title>", encoding="utf-8")
    app = create_app(settings.model_copy(update={"frontend_dist": dist}))
    with TestClient(app, base_url=BASE_URL) as client:
        page = client.get("/")
        health = client.get("/api/v1/health")
    assert page.status_code == 200
    assert "<title>app</title>" in page.text
    assert page.headers["Content-Security-Policy"] == (
        "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    )
    assert health.json() == {"status": "ok"}


def test_no_frontend_build_means_no_root_page(api: TestClient) -> None:
    assert api.get("/").status_code == 404
