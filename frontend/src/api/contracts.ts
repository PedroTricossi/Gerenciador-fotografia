import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { filenameFromDisposition } from "../domain/filename";
import {
  type ContractCreate,
  type ContractOut,
  type ContractPatch,
  api,
  send,
  unwrap,
} from "./client";
import { saveBlob } from "./download";
import { clientKeys, contractKeys, overviewKeys } from "./keys";

export { contractKeys };

const PAGE_SIZE = 20;

const path = (id: string) => ({ path: { contract_id: id } });

export function useContracts(includeDeleted: boolean) {
  return useInfiniteQuery({
    queryKey: contractKeys.list(includeDeleted),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/contracts", {
          params: {
            query: {
              limit: PAGE_SIZE,
              include_deleted: includeDeleted,
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor,
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: contractKeys.one(id),
    queryFn: () => unwrap(api.GET("/api/v1/contracts/{contract_id}", { params: path(id) })),
  });
}

function useStoreContract() {
  const client = useQueryClient();
  return (contract: ContractOut) => {
    client.setQueryData(contractKeys.one(contract.id), contract);
    // Saving a contract can create or rename the clients it names.
    return Promise.all([
      client.invalidateQueries({ queryKey: contractKeys.all }),
      client.invalidateQueries({ queryKey: clientKeys.all }),
      // Instalments and fees come from contracts, so the overview moves with them.
      client.invalidateQueries({ queryKey: overviewKeys.all }),
    ]);
  };
}

export function useCreateContract() {
  const store = useStoreContract();
  return useMutation({
    mutationFn: (body: ContractCreate) => unwrap(api.POST("/api/v1/contracts", { body })),
    onSuccess: store,
  });
}

export function useUpdateContract(id: string) {
  const store = useStoreContract();
  return useMutation({
    mutationFn: ({ version, body }: { version: number; body: ContractPatch }) =>
      unwrap(
        api.PATCH("/api/v1/contracts/{contract_id}", {
          params: { ...path(id), header: { "if-match": `"${version}"` } },
          body,
        }),
      ),
    onSuccess: store,
  });
}

export function useDeleteContract() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/contracts/{contract_id}", { params: path(id) })),
    onSuccess: (_data, id) =>
      Promise.all([
        client.invalidateQueries({ queryKey: contractKeys.all }),
        client.invalidateQueries({ queryKey: contractKeys.one(id) }),
        client.invalidateQueries({ queryKey: overviewKeys.all }),
      ]),
  });
}

export function useRestoreContract() {
  const store = useStoreContract();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/v1/contracts/{contract_id}/restore", { params: path(id) })),
    onSuccess: store,
  });
}

export async function downloadContractPdf(id: string): Promise<void> {
  const { data, response } = await send(
    api.GET("/api/v1/contracts/{contract_id}/pdf", { params: path(id), parseAs: "blob" }),
  );
  const name = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    `contrato-${id}.pdf`,
  );
  saveBlob(data as Blob, name);
}

export function useDownloadPdf() {
  return useMutation({ mutationFn: downloadContractPdf });
}
