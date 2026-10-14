import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { contractKeys } from "./contracts";
import { saveBlob } from "./download";

const PAGE_SIZE = 20;

export const clientKeys = { all: ["clients"] as const };

const path = (id: string) => ({ path: { client_id: id } });

export function useClients() {
  return useInfiniteQuery({
    queryKey: clientKeys.all,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/clients", {
          params: { query: { limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor,
  });
}

export async function exportClient(id: string): Promise<void> {
  const data = await unwrap(api.GET("/api/v1/clients/{client_id}/export", { params: path(id) }));
  saveBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    `cliente-${id}.json`,
  );
}

export function useExportClient() {
  return useMutation({ mutationFn: exportClient });
}

export function useAnonymiseClient() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/clients/{client_id}/anonymise", { params: path(id) })),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: clientKeys.all }),
        client.invalidateQueries({ queryKey: contractKeys.all }),
        client.invalidateQueries({ queryKey: ["contract"] }),
      ]),
  });
}
