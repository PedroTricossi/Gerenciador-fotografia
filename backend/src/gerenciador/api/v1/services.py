from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response

from gerenciador.api.deps import Catalog, Ctx
from gerenciador.api.v1.schemas import ServiceIn, ServiceOut, ServicePatch
from gerenciador.api.v1.versioning import expected_version
from gerenciador.services.catalog_service import ServiceView

router = APIRouter(prefix="/services", tags=["services"])


def _respond(view: ServiceView, response: Response) -> ServiceOut:
    response.headers["ETag"] = f'"{view.version}"'
    return ServiceOut.from_view(view)


@router.get("")
def list_services(service: Catalog, include_archived: bool = False) -> list[ServiceOut]:
    return [
        ServiceOut.from_view(view)
        for view in service.list_services(include_archived=include_archived)
    ]


@router.post("", status_code=201)
def create_service(body: ServiceIn, response: Response, ctx: Ctx, service: Catalog) -> ServiceOut:
    view = service.create(ctx, body.to_input())
    response.headers["Location"] = f"/api/v1/services/{view.id}"
    return _respond(view, response)


@router.get("/{service_id}")
def get_service(service_id: UUID, response: Response, service: Catalog) -> ServiceOut:
    return _respond(service.get(str(service_id)), response)


@router.patch("/{service_id}")
def update_service(
    service_id: UUID,
    body: ServicePatch,
    response: Response,
    ctx: Ctx,
    service: Catalog,
    if_match: Annotated[str | None, Header()] = None,
) -> ServiceOut:
    version = expected_version(if_match, "service")
    return _respond(service.update(ctx, str(service_id), version, body.to_changes()), response)


@router.post("/{service_id}/archive")
def archive_service(service_id: UUID, response: Response, ctx: Ctx, service: Catalog) -> ServiceOut:
    return _respond(service.archive(ctx, str(service_id)), response)


@router.post("/{service_id}/restore")
def restore_service(service_id: UUID, response: Response, ctx: Ctx, service: Catalog) -> ServiceOut:
    return _respond(service.restore(ctx, str(service_id)), response)
