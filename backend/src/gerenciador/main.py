"""Application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from gerenciador import API_PREFIX, APP_TITLE, APP_VERSION
from gerenciador.api.errors import register_error_handlers
from gerenciador.api.security import SecurityMiddleware
from gerenciador.api.v1 import api_router
from gerenciador.config import Settings, get_settings
from gerenciador.db.migrate import init_database
from gerenciador.db.session import create_session_factory
from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.crypto import FieldCipher
from gerenciador.services.pdf_renderer import WeasyPrintRenderer


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = init_database(settings.database_path)
    session_factory = create_session_factory(engine)
    cipher = FieldCipher.from_settings(settings)
    try:
        # Refuse to start with keys that cannot read the database.
        with session_factory() as session:
            ClientService(session, cipher, AuditService(session)).check_keys()
    except BaseException:
        engine.dispose()
        raise

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    # No documentation page and no schema endpoint: the pages would run third-party
    # scripts in this origin. `python -m gerenciador.export_openapi` writes the schema.
    app = FastAPI(
        title=APP_TITLE,
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.cipher = cipher
    app.state.contract_renderer = ContractRenderer(settings.template_path, settings)
    app.state.pdf_renderer = WeasyPrintRenderer()

    app.add_middleware(SecurityMiddleware)
    register_error_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
    return app
