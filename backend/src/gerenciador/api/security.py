"""Request checks and response headers for an app with no login.

A web page open in the same browser can try to call a server on localhost.
The Host allowlist blocks DNS rebinding, the fetch-metadata check blocks
cross-site requests of every method, and the Origin and JSON-only checks block
cross-site writes.
"""

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from gerenciador.api.errors import log_failure, problem_response

ALLOWED_HOSTNAMES = frozenset({"localhost", "127.0.0.1"})
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
_API_CSP = "default-src 'none'; frame-ancestors 'none'"
_APP_CSP = "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
_DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none'"
)
_DOCS_PATHS = frozenset({"/docs"})
_FOREIGN_SITES = frozenset({"cross-site", "same-site"})


def _rejection(request: Request, request_id: str) -> Response | None:
    host = request.headers.get("host", "")
    hostname = host.rsplit(":", 1)[0] if ":" in host else host
    if hostname not in ALLOWED_HOSTNAMES:
        return problem_response(400, "Invalid Host header", request_id)
    if request.url.path.startswith("/api/"):
        # Browsers say where a request came from. Another site may not even read:
        # a refused read must not reach the router, where it could be audited.
        site = request.headers.get("sec-fetch-site", "").strip().lower()
        if site in _FOREIGN_SITES:
            return problem_response(403, "Cross-site request not allowed", request_id)
    if request.method in _SAFE_METHODS:
        return None
    if request.headers.get("origin") != f"http://{host}":
        return problem_response(403, "Origin not allowed", request_id)
    has_body = (
        request.headers.get("content-length", "0") != "0" or "transfer-encoding" in request.headers
    )
    media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if has_body and media_type != "application/json":
        return problem_response(415, "Request body must be application/json", request_id)
    return None


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid4())
        request.state.request_id = request_id
        response = _rejection(request, request_id)
        if response is None:
            try:
                response = await call_next(request)
            except Exception as exc:
                log_failure("unhandled error", request_id, exc)
                response = problem_response(500, "Internal server error", request_id)

        path = request.url.path
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Content-Security-Policy"] = _API_CSP
        elif path in _DOCS_PATHS:
            response.headers["Content-Security-Policy"] = _DOCS_CSP
        else:
            response.headers["Content-Security-Policy"] = _APP_CSP
        return response
