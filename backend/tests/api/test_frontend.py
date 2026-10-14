from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gerenciador.config import Settings
from gerenciador.main import create_app

BASE_URL = "http://127.0.0.1:8000"
APP_CSP = "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
INDEX = "<!doctype html><title>app</title>"


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    folder = tmp_path / "dist"
    (folder / "assets").mkdir(parents=True)
    (folder / "index.html").write_text(INDEX, encoding="utf-8")
    (folder / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("outside dist", encoding="utf-8")
    return folder


@pytest.fixture
def site(settings: Settings, dist: Path) -> Iterator[TestClient]:
    app = create_app(settings.model_copy(update={"frontend_dist": dist}))
    with TestClient(app, base_url=BASE_URL) as client:
        yield client


@pytest.mark.parametrize("path", ["/", "/contratos", "/contratos/abc", "/clientes", "/docs"])
def test_page_paths_serve_the_app_with_its_csp(site: TestClient, path: str) -> None:
    response = site.get(path)
    assert response.status_code == 200
    assert response.text == INDEX
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["Content-Security-Policy"] == APP_CSP


def test_a_real_file_is_served_as_that_file(site: TestClient) -> None:
    response = site.get("/assets/app.js")
    assert response.status_code == 200
    assert response.text == "console.log(1)"
    assert "javascript" in response.headers["content-type"]


@pytest.mark.parametrize("path", ["/api/v1/nope", "/api/v1/contracts/x/y/z", "/api", "/api/"])
def test_unknown_api_paths_stay_problem_responses(site: TestClient, path: str) -> None:
    response = site.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"


@pytest.mark.parametrize("path", ["/%2e%2e/secret.txt", "/assets/%2e%2e/%2e%2e/secret.txt"])
def test_paths_that_escape_dist_are_refused(site: TestClient, path: str) -> None:
    response = site.get(path)
    assert response.status_code == 404
    assert "outside dist" not in response.text


def test_api_routes_still_answer(site: TestClient) -> None:
    assert site.get("/api/v1/health").json() == {"status": "ok"}


def test_a_dist_folder_without_index_serves_no_pages(settings: Settings, tmp_path: Path) -> None:
    empty = tmp_path / "empty-dist"
    empty.mkdir()
    app = create_app(settings.model_copy(update={"frontend_dist": empty}))
    with TestClient(app, base_url=BASE_URL) as client:
        assert client.get("/contratos").status_code == 404


@pytest.mark.parametrize("path", ["/%00", "/contratos%00x"])
def test_paths_with_a_null_byte_are_refused_without_a_stack_trace(
    site: TestClient, path: str
) -> None:
    response = site.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
