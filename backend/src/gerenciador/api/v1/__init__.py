from fastapi import APIRouter

from gerenciador.api.v1 import clients, contracts, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(contracts.router)
api_router.include_router(clients.router)
