"""Malformed input is a client error (4xx), never a 5xx."""

import base64
from typing import Any

import pytest
from fastapi.testclient import TestClient

CONTRACTS = "/api/v1/contracts"
CLIENTS = "/api/v1/clients"
AUDIT = "/api/v1/audit-events"
AGENDA = "/api/v1/agenda"
EXTREMES = ("0001-01-01T00:00:00+14:00", "9999-12-31T23:59:59-14:00")


def _cursor(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode("ascii")


CASES: list[tuple[str, dict[str, Any]]] = [
    (f"{AUDIT}/9999999999999999999999999", {}),
    (f"{AUDIT}/{'9' * 30}", {}),
    (f"{AUDIT}/-1", {}),
    (f"{AUDIT}/0", {}),
    *[
        (url, {"cursor": _cursor(f"{timestamp}|x")})
        for url in (CONTRACTS, CLIENTS)
        for timestamp in EXTREMES
    ],
    *[(AUDIT, {key: timestamp}) for key in ("from", "to") for timestamp in EXTREMES],
    (AGENDA, {"from": "yesterday", "to": "2026-10-15"}),
    (AGENDA, {"from": "0001-01-01", "to": "9999-12-31"}),
]


@pytest.mark.parametrize(("url", "params"), CASES)
def test_malformed_input_is_never_a_server_error(
    api: TestClient, url: str, params: dict[str, Any]
) -> None:
    response = api.get(url, params=params)
    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"
    assert all(value not in response.text for value in params.values())


def test_largest_valid_event_id_is_simply_not_found(api: TestClient) -> None:
    assert api.get(f"{AUDIT}/{2**63 - 1}").status_code == 404
    assert api.get(f"{AUDIT}/{2**63}").status_code == 422


def test_in_range_offsets_are_accepted(api: TestClient) -> None:
    moment = "2026-10-13T12:00:00+14:00"
    assert api.get(AUDIT, params={"from": moment, "to": moment}).status_code == 200
    for url in (CONTRACTS, CLIENTS):
        assert api.get(url, params={"cursor": _cursor(f"{moment}|x")}).status_code == 200
