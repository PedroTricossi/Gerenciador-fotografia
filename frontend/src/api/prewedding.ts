import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type PreweddingIn, api, unwrap } from "./client";
import { contractKeys } from "./keys";

const path = (contractId: string) => ({ path: { contract_id: contractId } });

// The list and the contract page both show the pre-wedding.
function useRefresh() {
  const client = useQueryClient();
  return (contractId: string) =>
    Promise.all([
      client.invalidateQueries({ queryKey: contractKeys.all }),
      client.invalidateQueries({ queryKey: contractKeys.one(contractId) }),
    ]);
}

type Schedule = { contractId: string; version: number | null; body: PreweddingIn };
type Cancel = { contractId: string; version: number };

export function useSchedulePrewedding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ contractId, version, body }: Schedule) =>
      unwrap(
        api.PUT("/api/v1/contracts/{contract_id}/prewedding", {
          params: {
            ...path(contractId),
            header: version === null ? {} : { "if-match": `"${version}"` },
          },
          body,
        }),
      ),
    onSuccess: (_data, { contractId }) => refresh(contractId),
    // A 412, 428 or 404 means the cached contract is stale; a retry must not resend it.
    onError: (_error, { contractId }) => refresh(contractId),
  });
}

export function useCancelPrewedding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ contractId, version }: Cancel) =>
      unwrap(
        api.DELETE("/api/v1/contracts/{contract_id}/prewedding", {
          params: { ...path(contractId), header: { "if-match": `"${version}"` } },
        }),
      ),
    onSuccess: (_data, { contractId }) => refresh(contractId),
    onError: (_error, { contractId }) => refresh(contractId),
  });
}
