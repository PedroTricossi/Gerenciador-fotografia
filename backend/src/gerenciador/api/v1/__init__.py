from fastapi import APIRouter, Depends

from gerenciador.api.deps import bind_actor
from gerenciador.api.v1 import audit, clients, contracts, health, prewedding, services

# Every route resolves the actor, so adding login means replacing one dependency.
api_router = APIRouter(dependencies=[Depends(bind_actor)])
api_router.include_router(health.router)
api_router.include_router(contracts.router)
api_router.include_router(prewedding.router)
api_router.include_router(clients.router)
api_router.include_router(services.router)
api_router.include_router(audit.router)
