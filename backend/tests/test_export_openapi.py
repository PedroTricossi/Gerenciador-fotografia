import json
from pathlib import Path
from typing import Any

import pytest

from gerenciador import config, export_openapi
from gerenciador.config import Settings
from gerenciador.db import migrate
from gerenciador.main import create_app


def _refuse(*args: Any, **kwargs: Any) -> None:
    raise AssertionError("the export must not read settings or open the database")


@pytest.fixture
def offline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "get_settings", _refuse)
    monkeypatch.setattr(config, "Settings", _refuse)
    monkeypatch.setattr(migrate, "init_database", _refuse)


@pytest.mark.usefixtures("offline")
def test_export_writes_the_schema_to_the_given_path(tmp_path: Path) -> None:
    target = tmp_path / "out" / "schema.json"
    target.parent.mkdir()
    export_openapi.main([str(target)])
    schema = json.loads(target.read_text(encoding="utf-8"))
    assert "/api/v1/contracts" in schema["paths"]
    assert "/api/v1/clients/{client_id}/anonymise" in schema["paths"]
    assert schema["info"] == {"title": "Gerenciador Fotografia", "version": "0.1.0"}


@pytest.mark.usefixtures("offline")
def test_export_defaults_to_openapi_json_in_the_current_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    export_openapi.main([])
    assert "/api/v1/contracts" in json.loads((tmp_path / "openapi.json").read_text())["paths"]


def test_exported_schema_is_the_schema_of_the_running_app(
    tmp_path: Path, settings: Settings
) -> None:
    target = tmp_path / "schema.json"
    export_openapi.main([str(target)])
    app = create_app(settings)
    try:
        assert json.loads(target.read_text(encoding="utf-8")) == app.openapi()
    finally:
        app.state.session_factory.kw["bind"].dispose()
