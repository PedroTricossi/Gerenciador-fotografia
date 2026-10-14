from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from gerenciador import __main__ as entrypoint
from gerenciador.config import Settings, generate_key
from gerenciador.main import create_app
from gerenciador.services.exceptions import KeyMismatchError

BASE_URL = "http://127.0.0.1:8000"
CONTRACTS = "/api/v1/contracts"
Payload = Callable[..., dict[str, Any]]
KEY_FIELDS = ("field_encryption_key", "cpf_lookup_key")


def _with_new_keys(settings: Settings, *fields: str) -> Settings:
    return settings.model_copy(update={field: SecretStr(generate_key()) for field in fields})


def _store_a_contract(settings: Settings, payload: Payload) -> dict[str, Any]:
    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        response = client.post(CONTRACTS, json=payload())
        assert response.status_code == 201
        body: dict[str, Any] = response.json()
        return body


def test_starts_with_matching_keys_and_existing_data(settings: Settings, payload: Payload) -> None:
    contract = _store_a_contract(settings, payload)
    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        response = client.get(f"{CONTRACTS}/{contract['id']}")
    assert response.status_code == 200
    assert response.json()["groom"]["cpf"] == "123.456.789-09"


@pytest.mark.parametrize(
    "regenerated", [KEY_FIELDS, ("field_encryption_key",), ("cpf_lookup_key",)]
)
def test_refuses_to_start_when_the_keys_do_not_match_the_database(
    settings: Settings, payload: Payload, regenerated: tuple[str, ...]
) -> None:
    _store_a_contract(settings, payload)
    rekeyed = _with_new_keys(settings, *regenerated)
    with pytest.raises(KeyMismatchError) as error:
        create_app(rekeyed)
    message = str(error.value)
    assert "do not match the database" in message
    for config in (settings, rekeyed):
        for field in KEY_FIELDS:
            assert getattr(config, field).get_secret_value() not in message
    for needle in ("João", "12345678909", "Flores"):
        assert needle not in message


def test_starts_with_new_keys_on_an_empty_database(settings: Settings) -> None:
    with TestClient(create_app(settings), base_url=BASE_URL):
        pass
    with TestClient(create_app(_with_new_keys(settings, *KEY_FIELDS)), base_url=BASE_URL) as client:
        assert client.get("/api/v1/health").status_code == 200


def test_starts_with_new_keys_when_every_client_is_anonymised(
    settings: Settings, payload: Payload
) -> None:
    with TestClient(create_app(settings), base_url=BASE_URL) as client:
        client.headers["Origin"] = BASE_URL
        contract = client.post(CONTRACTS, json=payload()).json()
        assert client.delete(f"{CONTRACTS}/{contract['id']}").status_code == 204
        for role in ("groom", "bride"):
            anonymised = client.post(f"/api/v1/clients/{contract[role]['id']}/anonymise")
            assert anonymised.status_code == 200
    with TestClient(create_app(_with_new_keys(settings, *KEY_FIELDS)), base_url=BASE_URL) as client:
        assert client.get("/api/v1/clients").status_code == 200


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
        # Following a link from another site to the app's own page is not an API call.
        linked = client.get("/", headers={"Sec-Fetch-Site": "cross-site"})
    assert linked.status_code == 200
    assert page.status_code == 200
    assert "<title>app</title>" in page.text
    assert page.headers["Content-Security-Policy"] == (
        "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    )
    assert health.json() == {"status": "ok"}


def test_no_frontend_build_means_no_root_page(api: TestClient) -> None:
    assert api.get("/").status_code == 404
