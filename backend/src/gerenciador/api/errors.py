"""Every error leaves the API as an RFC 9457 problem, with no internal detail."""

from collections.abc import Sequence
from http import HTTPStatus
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.responses import Response

from gerenciador.api.deps import get_current_actor
from gerenciador.domain.contract import ContractRuleError
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    InvalidCursorError,
    NotFoundError,
    StaleVersionError,
)

PROBLEM_MEDIA_TYPE = "application/problem+json"


def problem_response(
    status: int, detail: str, request_id: str, errors: list[dict[str, str]] | None = None
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "detail": detail,
        "request_id": request_id,
    }
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE)


def _request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", "unknown"))


def _field_errors(errors: Sequence[Any]) -> list[dict[str, str]]:
    """Field path and message only. The submitted value is never included."""
    return [
        {
            "field": ".".join(str(part) for part in error["loc"] if part != "body"),
            "message": str(error["msg"]),
        }
        for error in errors
    ]


def _rejected(request: Request, errors: list[dict[str, str]]) -> Response:
    """Answer 422 and audit the rejection: the route and field names, never the values."""
    ctx = RequestContext(actor=get_current_actor(), request_id=_request_id(request))
    with request.app.state.session_factory() as session:
        AuditService(session).record(
            ctx,
            "request.rejected",
            outcome="failure",
            details={
                "route": f"{request.method} {request.url.path}",
                "fields": [error["field"] for error in errors],
            },
        )
        session.commit()
    return problem_response(422, "Request validation failed", _request_id(request), errors)


def _invalid_request(request: Request, exc: Exception) -> Response:
    return _rejected(request, _field_errors(cast(RequestValidationError, exc).errors()))


def _rule_broken(request: Request, exc: Exception) -> Response:
    error = cast(ContractRuleError, exc)
    return _rejected(request, [{"field": error.field, "message": error.message}])


def _invalid_cursor(request: Request, exc: Exception) -> Response:
    return _rejected(request, [{"field": "cursor", "message": "cursor inválido"}])


def _not_found(request: Request, exc: Exception) -> Response:
    return problem_response(404, str(exc), _request_id(request))


def _conflict(request: Request, exc: Exception) -> Response:
    return problem_response(409, cast(ConflictError, exc).message, _request_id(request))


def _stale(request: Request, exc: Exception) -> Response:
    return problem_response(412, "The contract changed since it was loaded", _request_id(request))


def _http_error(request: Request, exc: Exception) -> Response:
    error = cast(HTTPException, exc)
    return problem_response(error.status_code, str(error.detail), _request_id(request))


def _unhandled(request: Request, exc: Exception) -> Response:
    return problem_response(500, "Internal server error", _request_id(request))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _invalid_request)
    app.add_exception_handler(ContractRuleError, _rule_broken)
    app.add_exception_handler(InvalidCursorError, _invalid_cursor)
    app.add_exception_handler(NotFoundError, _not_found)
    app.add_exception_handler(ConflictError, _conflict)
    app.add_exception_handler(StaleVersionError, _stale)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
