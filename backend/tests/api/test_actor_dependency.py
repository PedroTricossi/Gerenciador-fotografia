"""The login seam: every API route resolves the actor through one dependency."""

from typing import Any
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.routing import iter_route_contexts
from fastapi.testclient import TestClient
from sqlalchemy import select

from gerenciador.api.deps import get_current_actor
from gerenciador.db.models import AuditEvent

API = "/api/v1"
READ_ROUTES = [
    "/health",
    "/contracts",
    "/contracts/{contract_id}",
    "/clients",
    "/clients/{client_id}",
    "/audit-events",
    "/audit-events/{event_id}",
]


def _depends_on(dependant: Any, target: Any) -> bool:
    return any(sub.call is target or _depends_on(sub, target) for sub in dependant.dependencies)


def _refuse() -> str:
    raise HTTPException(status_code=401, detail="login required")


def test_every_api_route_depends_on_the_actor(api: TestClient) -> None:
    contexts = [
        context
        for context in iter_route_contexts(api.app.routes)
        if (context.path_format or "").startswith(API)
    ]
    templates = {context.path_format for context in contexts}
    assert templates >= {f"{API}{path}" for path in READ_ROUTES}
    assert len(contexts) >= 15
    missing = [
        f"{sorted(context.methods or [])} {context.path_format}"
        for context in contexts
        if not _depends_on(context.dependant, get_current_actor)
    ]
    assert missing == []


@pytest.mark.parametrize("template", READ_ROUTES)
def test_replacing_the_actor_dependency_guards_every_read(api: TestClient, template: str) -> None:
    path = template.format(contract_id=uuid4(), client_id=uuid4(), event_id=1)
    api.app.dependency_overrides[get_current_actor] = _refuse
    response = api.get(f"{API}{path}")
    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"


def test_rejection_events_carry_the_resolved_actor(api: TestClient) -> None:
    api.app.dependency_overrides[get_current_actor] = lambda: "tester"
    assert api.get(f"{API}/clients/not-a-uuid").status_code == 422
    with api.app.state.session_factory() as session:
        event = session.scalars(select(AuditEvent)).one()
        assert event.action == "request.rejected"
        assert event.actor == "tester"
