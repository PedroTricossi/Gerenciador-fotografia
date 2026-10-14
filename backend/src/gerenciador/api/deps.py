"""FastAPI dependencies. Routers get everything they need from here."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session

from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService
from gerenciador.services.contract_service import ContractService


def get_current_actor() -> str:
    """Who is making the request. Replace this when login is added."""
    return "owner"


def bind_actor(request: Request, actor: Annotated[str, Depends(get_current_actor)]) -> None:
    """Resolve the actor for every API route and keep it for error handlers."""
    request.state.actor = actor


def get_context(
    request: Request, actor: Annotated[str, Depends(get_current_actor)]
) -> RequestContext:
    return RequestContext(actor=actor, request_id=request.state.request_id)


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


DbSession = Annotated[Session, Depends(get_session)]


def get_audit_service(session: DbSession) -> AuditService:
    return AuditService(session)


def get_client_service(request: Request, session: DbSession) -> ClientService:
    return ClientService(session, request.app.state.cipher, AuditService(session))


def get_contract_service(request: Request, session: DbSession) -> ContractService:
    audit = AuditService(session)
    clients = ClientService(session, request.app.state.cipher, audit)
    return ContractService(session, clients, audit)


def get_document_service(request: Request, session: DbSession) -> ContractDocumentService:
    audit = AuditService(session)
    clients = ClientService(session, request.app.state.cipher, audit)
    return ContractDocumentService(
        session,
        ContractService(session, clients, audit),
        audit,
        request.app.state.contract_renderer,
        request.app.state.pdf_renderer,
    )


Ctx = Annotated[RequestContext, Depends(get_context)]
Audit = Annotated[AuditService, Depends(get_audit_service)]
Clients = Annotated[ClientService, Depends(get_client_service)]
Contracts = Annotated[ContractService, Depends(get_contract_service)]
Documents = Annotated[ContractDocumentService, Depends(get_document_service)]
Limit = Annotated[int, Query(ge=1, le=100)]
