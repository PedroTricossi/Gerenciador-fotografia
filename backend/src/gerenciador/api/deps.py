"""FastAPI dependencies. Routers get everything they need from here."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.orm import Session

from gerenciador.services.agenda_service import AgendaService
from gerenciador.services.audit_service import AuditService
from gerenciador.services.catalog_service import CatalogService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_document import ContractDocumentService
from gerenciador.services.contract_service import ContractService
from gerenciador.services.expense_entry_service import ExpenseEntryService
from gerenciador.services.expense_service import ExpenseService
from gerenciador.services.expense_type_service import ExpenseTypeService
from gerenciador.services.fixed_cost_service import FixedCostService
from gerenciador.services.instalment_service import InstalmentService
from gerenciador.services.prewedding_service import PreweddingService
from gerenciador.services.second_photographer_service import SecondPhotographerService


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


def get_catalog_service(session: DbSession) -> CatalogService:
    return CatalogService(session, AuditService(session))


def get_expense_type_service(session: DbSession) -> ExpenseTypeService:
    return ExpenseTypeService(session, AuditService(session))


def get_expense_service(session: DbSession) -> ExpenseService:
    audit = AuditService(session)
    return ExpenseService(session, ExpenseTypeService(session, audit), audit)


def get_expense_entry_service(session: DbSession) -> ExpenseEntryService:
    return ExpenseEntryService(session)


def get_fixed_cost_service(session: DbSession) -> FixedCostService:
    audit = AuditService(session)
    return FixedCostService(session, ExpenseTypeService(session, audit), audit)


def get_second_photographer_service(session: DbSession) -> SecondPhotographerService:
    return SecondPhotographerService(session, AuditService(session))


def get_client_service(request: Request, session: DbSession) -> ClientService:
    return ClientService(session, request.app.state.cipher, AuditService(session))


def get_contract_service(request: Request, session: DbSession) -> ContractService:
    audit = AuditService(session)
    clients = ClientService(session, request.app.state.cipher, audit)
    return ContractService(session, clients, audit)


def get_prewedding_service(session: DbSession) -> PreweddingService:
    return PreweddingService(session, AuditService(session))


def get_instalment_service(session: DbSession) -> InstalmentService:
    return InstalmentService(session, AuditService(session))


def get_agenda_service(session: DbSession) -> AgendaService:
    return AgendaService(session)


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
Catalog = Annotated[CatalogService, Depends(get_catalog_service)]
ExpenseTypes = Annotated[ExpenseTypeService, Depends(get_expense_type_service)]
Expenses = Annotated[ExpenseService, Depends(get_expense_service)]
ExpenseEntries = Annotated[ExpenseEntryService, Depends(get_expense_entry_service)]
FixedCosts = Annotated[FixedCostService, Depends(get_fixed_cost_service)]
SecondPhotographer = Annotated[SecondPhotographerService, Depends(get_second_photographer_service)]
Clients = Annotated[ClientService, Depends(get_client_service)]
Contracts = Annotated[ContractService, Depends(get_contract_service)]
Preweddings = Annotated[PreweddingService, Depends(get_prewedding_service)]
Instalments = Annotated[InstalmentService, Depends(get_instalment_service)]
Agenda = Annotated[AgendaService, Depends(get_agenda_service)]
Documents = Annotated[ContractDocumentService, Depends(get_document_service)]
Limit = Annotated[int, Query(ge=1, le=100)]
