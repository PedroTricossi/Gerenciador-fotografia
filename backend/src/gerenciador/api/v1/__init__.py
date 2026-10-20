from fastapi import APIRouter, Depends

from gerenciador.api.deps import bind_actor
from gerenciador.api.v1 import (
    agenda,
    audit,
    clients,
    contracts,
    expense_entries,
    expense_types,
    expenses,
    fixed_costs,
    health,
    instalments,
    overview,
    prewedding,
    second_photographer,
    services,
    transport_guide,
)

# Every route resolves the actor, so adding login means replacing one dependency.
api_router = APIRouter(dependencies=[Depends(bind_actor)])
api_router.include_router(health.router)
api_router.include_router(contracts.router)
api_router.include_router(prewedding.router)
api_router.include_router(instalments.router)
api_router.include_router(agenda.router)
api_router.include_router(clients.router)
api_router.include_router(services.router)
api_router.include_router(expense_types.router)
api_router.include_router(expenses.router)
api_router.include_router(expense_entries.router)
api_router.include_router(fixed_costs.router)
api_router.include_router(second_photographer.router)
api_router.include_router(overview.router)
api_router.include_router(transport_guide.router)
api_router.include_router(audit.router)
