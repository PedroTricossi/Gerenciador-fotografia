import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { contractKeys, instalmentKeys } from "./keys";

export { instalmentKeys };

export type MarkTarget = { contractId: string; number: number };

const path = ({ contractId, number }: MarkTarget) => ({
  path: { contract_id: contractId, number },
});

export function useInstalments(params: { unpaidThrough?: string; enabled?: boolean } = {}) {
  const unpaidThrough = params.unpaidThrough ?? null;
  return useQuery({
    queryKey: instalmentKeys.list(unpaidThrough),
    enabled: params.enabled ?? true,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/instalments", {
          params: { query: unpaidThrough ? { unpaid_through: unpaidThrough } : {} },
        }),
      ),
  });
}

function useRefreshAfter() {
  const client = useQueryClient();
  return (target: MarkTarget) =>
    Promise.all([
      client.invalidateQueries({ queryKey: instalmentKeys.all }),
      client.invalidateQueries({ queryKey: contractKeys.one(target.contractId) }),
    ]);
}

export function useMarkPaid() {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: ({ paidOn, ...target }: MarkTarget & { paidOn: string }) =>
      unwrap(
        api.POST("/api/v1/contracts/{contract_id}/instalments/{number}/paid", {
          params: path(target),
          body: { paid_on: paidOn },
        }),
      ),
    onSuccess: (_data, target) => refresh(target),
  });
}

export function useMarkUnpaid() {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (target: MarkTarget) =>
      unwrap(
        api.DELETE("/api/v1/contracts/{contract_id}/instalments/{number}/paid", {
          params: path(target),
        }),
      ),
    onSuccess: (_data, target) => refresh(target),
  });
}
