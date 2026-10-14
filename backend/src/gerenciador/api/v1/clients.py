from uuid import UUID

from fastapi import APIRouter

from gerenciador.api.deps import Clients, Ctx, Limit
from gerenciador.api.v1.schemas import ClientExportOut, ClientOut, ClientPatch, PageOut

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("")
def list_clients(
    service: Clients, limit: Limit = 20, cursor: str | None = None
) -> PageOut[ClientOut]:
    page = service.list_page(limit=limit, cursor=cursor)
    return PageOut(
        items=[ClientOut.from_view(view, mask=True) for view in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/{client_id}")
def get_client(client_id: UUID, service: Clients) -> ClientOut:
    return ClientOut.from_view(service.get(str(client_id)), mask=False)


@router.patch("/{client_id}")
def update_client(client_id: UUID, body: ClientPatch, ctx: Ctx, service: Clients) -> ClientOut:
    view = service.update(
        ctx, str(client_id), full_name=body.full_name, cpf=body.cpf, address=body.address
    )
    return ClientOut.from_view(view, mask=False)


@router.get("/{client_id}/export")
def export_client(client_id: UUID, ctx: Ctx, service: Clients) -> ClientExportOut:
    return ClientExportOut.from_export(service.export(ctx, str(client_id)))


@router.post("/{client_id}/anonymise")
def anonymise_client(client_id: UUID, ctx: Ctx, service: Clients) -> ClientOut:
    return ClientOut.from_view(service.anonymise(ctx, str(client_id)), mask=False)
