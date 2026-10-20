import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Schemas, api, unwrap } from "./client";
import { expenseKeys, overviewKeys } from "./keys";

export { expenseKeys };

type Versioned = { version: number };

const match = (version: number) => ({ "if-match": `"${version}"` });

export function useExpenseEntries(month: string) {
  return useQuery({
    queryKey: expenseKeys.entries(month),
    queryFn: () =>
      unwrap(api.GET("/api/v1/expense-entries", { params: { query: { from: month, to: month } } })),
  });
}

export function useExpense(id: string | null) {
  return useQuery({
    queryKey: expenseKeys.expense(id ?? ""),
    queryFn: () =>
      unwrap(api.GET("/api/v1/expenses/{expense_id}", { params: { path: { expense_id: id! } } })),
    enabled: id !== null,
  });
}

export function useExpenseTypes({ includeArchived }: { includeArchived: boolean }) {
  return useQuery({
    queryKey: expenseKeys.types(includeArchived),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/expense-types", {
          params: { query: { include_archived: includeArchived } },
        }),
      ),
  });
}

export function useExpenseEvents() {
  return useQuery({
    queryKey: expenseKeys.events,
    queryFn: () => unwrap(api.GET("/api/v1/expense-events", {})),
  });
}

export function useFixedCosts() {
  return useQuery({
    queryKey: expenseKeys.fixedCosts,
    queryFn: () => unwrap(api.GET("/api/v1/fixed-costs", {})),
  });
}

export function useSecondPhotographerFee() {
  return useQuery({
    queryKey: expenseKeys.fee,
    queryFn: () => unwrap(api.GET("/api/v1/second-photographer-fee", {})),
  });
}

// Entries are derived from expenses, fixed costs, fees and types together, so every write
// refreshes the whole family.
function useRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: expenseKeys.all }),
      client.invalidateQueries({ queryKey: overviewKeys.all }),
    ]);
}

export function useCreateExpenseType() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Schemas["ExpenseTypeIn"]) =>
      unwrap(api.POST("/api/v1/expense-types", { body })),
    onSuccess: refresh,
  });
}

export function useRenameExpenseType() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version, name }: { id: string } & Versioned & { name: string }) =>
      unwrap(
        api.PATCH("/api/v1/expense-types/{type_id}", {
          params: { path: { type_id: id }, header: match(version) },
          body: { name },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useArchiveExpenseType() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/api/v1/expense-types/{type_id}/archive", { params: { path: { type_id: id } } }),
      ),
    onSuccess: refresh,
  });
}

export function useRestoreExpenseType() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/api/v1/expense-types/{type_id}/restore", { params: { path: { type_id: id } } }),
      ),
    onSuccess: refresh,
  });
}

export function useCreateExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Schemas["ExpenseIn"]) => unwrap(api.POST("/api/v1/expenses", { body })),
    onSuccess: refresh,
  });
}

export function useUpdateExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version, body }: { id: string; body: Schemas["ExpenseIn"] } & Versioned) =>
      unwrap(
        api.PATCH("/api/v1/expenses/{expense_id}", {
          params: { path: { expense_id: id }, header: match(version) },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useDeleteExpense() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version }: { id: string } & Versioned) =>
      unwrap(
        api.DELETE("/api/v1/expenses/{expense_id}", {
          params: { path: { expense_id: id }, header: match(version) },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useCreateFixedCost() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Schemas["FixedCostIn"]) => unwrap(api.POST("/api/v1/fixed-costs", { body })),
    onSuccess: refresh,
  });
}

export function useRenameFixedCost() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version, name }: { id: string; name: string } & Versioned) =>
      unwrap(
        api.PATCH("/api/v1/fixed-costs/{cost_id}", {
          params: { path: { cost_id: id }, header: match(version) },
          body: { name },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useSetFixedCostPrice() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Schemas["PriceIn"]) =>
      unwrap(
        api.POST("/api/v1/fixed-costs/{cost_id}/prices", {
          params: { path: { cost_id: id } },
          body: { from_month: body.from_month, amount_cents: body.amount_cents },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useStopFixedCost() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, endMonth }: { id: string; endMonth: string }) =>
      unwrap(
        api.POST("/api/v1/fixed-costs/{cost_id}/stop", {
          params: { path: { cost_id: id } },
          body: { end_month: endMonth },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useResumeFixedCost() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/api/v1/fixed-costs/{cost_id}/resume", { params: { path: { cost_id: id } } }),
      ),
    onSuccess: refresh,
  });
}

export function useDeleteFixedCost() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, version }: { id: string } & Versioned) =>
      unwrap(
        api.DELETE("/api/v1/fixed-costs/{cost_id}", {
          params: { path: { cost_id: id }, header: match(version) },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useSetSecondPhotographerFee() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Schemas["PriceIn"]) =>
      unwrap(api.POST("/api/v1/second-photographer-fee/prices", { body })),
    onSuccess: refresh,
  });
}

export function useSetContractFee() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ contractId, amountCents }: { contractId: string; amountCents: number }) =>
      unwrap(
        api.PUT("/api/v1/contracts/{contract_id}/second-photographer-fee", {
          params: { path: { contract_id: contractId } },
          body: { amount_cents: amountCents },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useClearContractFee() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (contractId: string) =>
      unwrap(
        api.DELETE("/api/v1/contracts/{contract_id}/second-photographer-fee", {
          params: { path: { contract_id: contractId } },
        }),
      ),
    onSuccess: refresh,
  });
}
