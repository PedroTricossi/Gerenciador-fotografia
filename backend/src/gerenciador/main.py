"""Application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from gerenciador.api.errors import register_error_handlers
from gerenciador.api.security import SecurityMiddleware
from gerenciador.api.v1 import api_router
from gerenciador.config import Settings, get_settings
from gerenciador.db.migrate import init_database
from gerenciador.db.session import create_session_factory
from gerenciador.services.contract_renderer import ContractRenderer
from gerenciador.services.crypto import FieldCipher
from gerenciador.services.pdf_renderer import WeasyPrintRenderer


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = init_database(settings.database_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(title="Gerenciador Fotografia", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = create_session_factory(engine)
    app.state.cipher = FieldCipher.from_settings(settings)
    app.state.contract_renderer = ContractRenderer(settings.template_path, settings)
    app.state.pdf_renderer = WeasyPrintRenderer()

    app.add_middleware(SecurityMiddleware)
    register_error_handlers(app)
    app.include_router(api_router, prefix="/api/v1")
    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")
    return app
