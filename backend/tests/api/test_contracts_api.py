import datetime as dt
import hashlib
import io
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select

from gerenciador.api.v1.versioning import expected_version
from gerenciador.db.models import AuditEvent
from gerenciador.services.exceptions import StaleVersionError

URL = "/api/v1/contracts"
PROBLEM = "application/problem+json"
Payload = Callable[..., dict[str, Any]]


def _create(api: TestClient, payload: Payload, **overrides: Any) -> dict[str, Any]:
    response = api.post(URL, json=payload(**overrides))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def _with(data: dict[str, Any], path: str, value: Any) -> dict[str, Any]:
    """Set a nested key given a dotted path."""
    target = data
    *parents, last = path.split(".")
    for key in parents:
        target = target[key]
    target[last] = value
    return data


def _fields(response: Any) -> list[str]:
    return [error["field"] for error in response.json()["errors"]]


SERVICE_ID_CEREMONY = "5e7a1c00-0000-4000-8000-000000000002"


def test_create_returns_the_contract(api: TestClient, payload: Payload) -> None:
    response = api.post(URL, json=payload())
    assert response.status_code == 201
    body = response.json()
    assert response.headers["Location"] == f"{URL}/{body['id']}"
    assert response.headers["ETag"] == '"1"'
    assert body["groom"]["full_name"] == "João da Silva"
    assert body["groom"]["cpf"] == "123.456.789-09"
    assert body["bride"]["cpf"] == "987.654.321-00"
    assert body["couple_address"] == "Rua das Flores 100"
    assert body["payment"]["items"][0] == {
        "service_id": "5e7a1c00-0000-4000-8000-000000000001",
        "description": "Diária segundo fotógrafo",
        "amount_cents": 50000,
    }
    assert body["event"] == {
        "date": "2027-03-14",
        "venue_name": "Igreja Matriz",
        "venue_address": None,
        "coverage_start": "16:00:00",
        "coverage_end": None,
        "hours_contracted": None,
    }
    assert body["payment"]["total_cents"] == 200000
    assert body["payment"]["pix_discount_cents"] == 30000
    assert len(body["payment"]["items"]) == 3
    assert body["signing"] == {"city": "Curitiba", "date": "2026-10-13"}
    assert body["version"] == 1
    assert body["deleted_at"] is None


def test_create_applies_defaults(api: TestClient, payload: Payload) -> None:
    data = payload()
    del data["photographer_count"]
    del data["signing"]
    del data["payment"]["pix_discount_cents"]
    response = api.post(URL, json=data)
    assert response.status_code == 201
    body = response.json()
    assert body["photographer_count"] == 2
    assert body["signing"] == {"city": "Curitiba", "date": dt.date.today().isoformat()}
    assert body["payment"]["pix_discount_cents"] is None
    assert body["payment"]["total_cents"] == 230000


@pytest.mark.parametrize(
    ("path", "value", "field"),
    [
        ("groom.cpf", "123.456.789-00", "groom.cpf"),
        ("groom.cpf", "abc12345678909", "groom.cpf"),
        ("groom.full_name", "   ", "groom.full_name"),
        ("groom.full_name", "x" * 201, "groom.full_name"),
        ("couple_address", "", "couple_address"),
        ("event.date", "14/03/2027", "event.date"),
        ("event.venue_name", "x" * 201, "event.venue_name"),
        ("event.hours_contracted", 25, "event.hours_contracted"),
        ("photographer_count", 0, "photographer_count"),
        ("photographer_count", "2", "photographer_count"),
        ("payment.items", [], "payment.items"),
        (
            "payment.items",
            [{"service_id": "5e7a1c00-0000-4000-8000-000000000001", "amount_cents": 1}] * 21,
            "payment.items",
        ),
        (
            "payment.items",
            [{"service_id": "5e7a1c00-0000-4000-8000-000000000001", "amount_cents": 10.5}],
            "payment.items.0.amount_cents",
        ),
        (
            "payment.items",
            [{"service_id": "5e7a1c00-0000-4000-8000-000000000001", "amount_cents": 0}],
            "payment.items.0.amount_cents",
        ),
        ("payment.pix_discount_cents", 230000, "payment.pix_discount_cents"),
        ("bride.cpf", "123.456.789-09", "bride.cpf"),
        ("nickname", "x", "*"),
        ("groom.nickname", "x", "groom.*"),
        ("groom.full_name", "João\x00da Silva", "groom.full_name"),
        ("bride.full_name", "Maria\nSouza", "bride.full_name"),
        ("couple_address", "Rua das Flores\t100", "couple_address"),
        ("couple_address", "Rua das Flores\r\n100", "couple_address"),
        ("event.venue_name", "Igreja\x1bMatriz", "event.venue_name"),
        ("event.venue_address", "Praça\x7f1", "event.venue_address"),
        ("signing.city", "Curi\x85tiba", "signing.city"),
        (
            "payment.items",
            [{"service_id": "not-a-uuid", "amount_cents": 100000}],
            "payment.items.0.service_id",
        ),
        (
            "payment.items",
            [{"service_id": "5e7a1c00-0000-4000-8000-0000000000ff", "amount_cents": 100000}],
            "payment.items.0.service_id",
        ),
    ],
)
def test_create_validation(
    api: TestClient, payload: Payload, path: str, value: Any, field: str
) -> None:
    response = api.post(URL, json=_with(payload(), path, value))
    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM
    assert field in _fields(response)
    assert api.get(URL).json()["items"] == []


def test_validation_errors_do_not_echo_submitted_values(api: TestClient, payload: Payload) -> None:
    data = _with(payload(), "groom.cpf", "999.999.999-99")
    _with(data, "bride.full_name", "Nome Secreto " + "x" * 200)
    response = api.post(URL, json=data)
    assert response.status_code == 422
    assert "999.999.999-99" not in response.text
    assert "Nome Secreto" not in response.text


def test_blank_optional_fields_are_treated_as_absent(api: TestClient, payload: Payload) -> None:
    data = _with(payload(), "event.venue_address", "")
    _with(data, "event.coverage_end", "   ")
    body = _create(api, lambda: data)
    assert body["event"]["venue_address"] is None
    assert body["event"]["coverage_end"] is None


def test_rejected_requests_are_audited_without_values(api: TestClient, payload: Payload) -> None:
    api.post(URL, json=payload(couple_address=""))
    with api.app.state.session_factory() as session:
        event = session.scalars(
            select(AuditEvent).where(AuditEvent.action == "request.rejected")
        ).one()
    assert event.outcome == "failure"
    assert event.details == {"route": "POST /api/v1/contracts", "fields": ["couple_address"]}


def test_get_returns_full_cpf_and_etag(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.get(f"{URL}/{created['id']}")
    assert response.status_code == 200
    assert response.headers["ETag"] == '"1"'
    assert response.json() == created


def test_list_masks_cpfs_and_paginates(api: TestClient, payload: Payload) -> None:
    ids = [
        _create(api, payload, event={"date": f"202{year}-01-01", "venue_name": "Igreja"})["id"]
        for year in (7, 8, 9)
    ]
    first = api.get(URL, params={"limit": 2}).json()
    assert [item["id"] for item in first["items"]] == [ids[2], ids[1]]
    assert first["items"][0]["groom"]["cpf"] == "***.***.***-09"
    assert first["next_cursor"]
    second = api.get(URL, params={"limit": 2, "cursor": first["next_cursor"]}).json()
    assert [item["id"] for item in second["items"]] == [ids[0]]
    assert second["next_cursor"] is None


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"cursor": "garbage"}, "cursor"),
        ({"limit": 0}, "query.limit"),
        ({"limit": 101}, "query.limit"),
    ],
)
def test_list_rejects_bad_parameters(api: TestClient, params: dict[str, Any], field: str) -> None:
    response = api.get(URL, params=params)
    assert response.status_code == 422
    assert field in _fields(response)


def test_unknown_and_malformed_ids(api: TestClient) -> None:
    missing = f"{URL}/{uuid4()}"
    assert api.get(missing).status_code == 404
    assert api.patch(missing, json={}, headers={"If-Match": '"1"'}).status_code == 404
    assert api.delete(missing).status_code == 404
    assert api.post(f"{missing}/restore").status_code == 404
    assert api.get(f"{missing}/pdf").status_code == 404
    assert api.get(f"{URL}/not-a-uuid").status_code == 422


def test_patch_requires_if_match(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.patch(f"{URL}/{created['id']}", json={"event": {"venue_name": "Catedral"}})
    assert response.status_code == 428
    assert response.headers["content-type"] == PROBLEM


def test_patch_merges_nested_fields_and_bumps_the_version(
    api: TestClient, payload: Payload
) -> None:
    created = _create(api, payload)
    response = api.patch(
        f"{URL}/{created['id']}",
        json={"event": {"venue_name": "Catedral"}},
        headers={"If-Match": '"1"'},
    )
    assert response.status_code == 200
    assert response.headers["ETag"] == '"2"'
    body = response.json()
    assert body["version"] == 2
    assert body["event"]["venue_name"] == "Catedral"
    assert body["event"]["date"] == "2027-03-14"
    assert body["event"]["coverage_start"] == "16:00:00"
    assert body["payment"] == created["payment"]


@pytest.mark.parametrize(
    "if_match", ['"1"', "abc", '"0"', "*", 'W/"2"', "2", '"' + "9" * 5000 + '"']
)
def test_patch_with_a_stale_or_unreadable_version_is_refused(
    api: TestClient, payload: Payload, if_match: str
) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    api.patch(url, json={"event": {"venue_name": "Catedral"}}, headers={"If-Match": '"1"'})
    response = api.patch(
        url, json={"event": {"venue_name": "Capela"}}, headers={"If-Match": if_match}
    )
    assert response.status_code == 412
    assert api.get(url).json()["event"]["venue_name"] == "Catedral"


def test_patch_can_remove_the_discount_and_replace_items(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    removed = api.patch(
        url, json={"payment": {"pix_discount_cents": None}}, headers={"If-Match": '"1"'}
    ).json()
    assert removed["payment"]["pix_discount_cents"] is None
    assert removed["payment"]["total_cents"] == 230000
    assert len(removed["payment"]["items"]) == 3

    replaced = api.patch(
        url,
        json={"payment": {"items": [{"service_id": SERVICE_ID_CEREMONY, "amount_cents": 100000}]}},
        headers={"If-Match": '"2"'},
    ).json()
    assert replaced["payment"]["items"] == [
        {
            "service_id": SERVICE_ID_CEREMONY,
            "description": "Cobertura da cerimônia na igreja",
            "amount_cents": 100000,
        }
    ]
    assert replaced["payment"]["total_cents"] == 100000


@pytest.mark.parametrize(
    ("patch", "field"),
    [
        ({"payment": {"pix_discount_cents": 99999999}}, "payment.pix_discount_cents"),
        ({"couple_address": None}, "couple_address"),
        ({"groom": None}, "groom"),
        ({"groom": {"cpf": "987.654.321-00"}}, "bride.cpf"),
        ({"nickname": "x"}, "*"),
    ],
)
def test_patch_validation(
    api: TestClient, payload: Payload, patch: dict[str, Any], field: str
) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    response = api.patch(url, json=patch, headers={"If-Match": '"1"'})
    assert response.status_code == 422
    assert field in _fields(response)
    assert api.get(url).json() == created


def test_empty_patch_changes_nothing(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.patch(f"{URL}/{created['id']}", json={}, headers={"If-Match": '"1"'})
    assert response.status_code == 200
    assert response.headers["ETag"] == '"1"'
    assert response.json() == created


def test_delete_and_restore(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    assert api.post(f"{url}/restore").status_code == 409

    assert api.delete(url).status_code == 204
    assert api.delete(url).status_code == 204
    assert api.get(URL).json()["items"] == []
    assert len(api.get(URL, params={"include_deleted": True}).json()["items"]) == 1
    assert api.get(url).json()["deleted_at"] is not None
    assert (
        api.patch(url, json={"event": {"venue_name": "X"}}, headers={"If-Match": '"1"'}).status_code
        == 409
    )
    assert api.get(f"{url}/pdf").status_code == 409

    restored = api.post(f"{url}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None
    assert len(api.get(URL).json()["items"]) == 1


def test_pdf_download(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.get(f"{URL}/{created['id']}/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert (
        response.headers["Content-Disposition"]
        == 'attachment; filename="contrato-joao-maria-2027-03-14.pdf"'
    )
    assert response.headers["X-Content-SHA256"] == hashlib.sha256(response.content).hexdigest()
    assert response.headers["Cache-Control"] == "no-store"
    text = "".join(
        "".join((page.extract_text() or "").split())
        for page in PdfReader(io.BytesIO(response.content)).pages
    )
    assert "JoãodaSilvaeMariaSouza" in text
    assert "R$2.000,00(doismilreais)" in text


def test_stale_version_wins_over_an_invalid_body(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    api.patch(url, json={"event": {"venue_name": "Catedral"}}, headers={"If-Match": '"1"'})
    response = api.patch(url, json={"couple_address": None}, headers={"If-Match": '"1"'})
    assert response.status_code == 412


def test_deleted_wins_over_a_stale_version(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    url = f"{URL}/{created['id']}"
    api.delete(url)
    response = api.patch(url, json={"event": {"venue_name": "X"}}, headers={"If-Match": '"9"'})
    assert response.status_code == 409


def test_weak_validator_is_refused(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    response = api.patch(
        f"{URL}/{created['id']}",
        json={"event": {"venue_name": "Catedral"}},
        headers={"If-Match": 'W/"1"'},
    )
    assert response.status_code == 412


@pytest.mark.parametrize("value", ['"٢"', '"²"', '"-1"', '""', "1", 'W/"1"', "*"])
def test_unreadable_validators_are_stale(value: str) -> None:
    with pytest.raises(StaleVersionError):
        expected_version(value, "contract")


def test_control_characters_are_refused_with_a_fixed_message(
    api: TestClient, payload: Payload
) -> None:
    response = api.post(URL, json=_with(payload(), "groom.full_name", "Nome\x00Secreto"))
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {
            "field": "groom.full_name",
            "message": "Value error, não pode conter caracteres de controle",
        }
    ]
    assert "Secreto" not in response.text


def test_control_characters_are_refused_when_editing(api: TestClient, payload: Payload) -> None:
    created = _create(api, payload)
    contract = api.patch(
        f"{URL}/{created['id']}",
        json={"event": {"venue_name": "Igreja\nMatriz"}},
        headers={"If-Match": '"1"'},
    )
    assert contract.status_code == 422
    client = api.patch(
        f"/api/v1/clients/{created['groom']['id']}", json={"address": "Rua\x00Nova 5"}
    )
    assert client.status_code == 422
    assert api.get(f"{URL}/{created['id']}").json() == created


def test_surrounding_whitespace_is_still_trimmed(api: TestClient, payload: Payload) -> None:
    body = _create(api, lambda: _with(payload(), "groom.full_name", "  João da Silva\n"))
    assert body["groom"]["full_name"] == "João da Silva"
