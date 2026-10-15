import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ServiceIn, type ServicePatch, api, unwrap } from "./client";
import { serviceKeys } from "./keys";

const path = (id: string) => ({ path: { service_id: id } });

export function useServices(includeArchived: boolean) {
  return useQuery({
    queryKey: serviceKeys.list(includeArchived),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/services", { params: { query: { include_archived: includeArchived } } }),
      ),
  });
}

// Contracts keep their own copy of each item, so a catalog change touches no contract cache.
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: serviceKeys.all });
}

export function useCreateService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: ServiceIn) => unwrap(api.POST("/api/v1/services", { body })),
    onSuccess: refresh,
  });
}

export function useUpdateService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version, body }: { id: string; version: number; body: ServicePatch }) =>
      unwrap(
        api.PATCH("/api/v1/services/{service_id}", {
          params: { ...path(id), header: { "if-match": `"${version}"` } },
          body,
        }),
      ),
    onSuccess: refresh,
    // A 412 or 404 means the cached row is stale; reopening it must not resend the old version.
    onError: refresh,
  });
}

export function useArchiveService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/services/{service_id}/archive", { params: path(id) })),
    onSuccess: refresh,
  });
}

export function useRestoreService() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/services/{service_id}/restore", { params: path(id) })),
    onSuccess: refresh,
  });
}
