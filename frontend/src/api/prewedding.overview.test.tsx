import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../test/server";
import { makeContract } from "../test/fixtures";
import { expenseKeys, overviewKeys } from "./keys";
import { useCancelPrewedding, useSchedulePrewedding } from "./prewedding";

function setup() {
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", () => HttpResponse.json(makeContract())),
    http.delete("/api/v1/contracts/:id/prewedding", () => HttpResponse.json(makeContract())),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const overviewKey = overviewKeys.overview("month", "2026-10", "2026-10-20");
  const expenseKey = [...expenseKeys.all, "x"];
  client.setQueryData(overviewKey, {});
  client.setQueryData(expenseKey, {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = () => [
    client.getQueryState(overviewKey)?.isInvalidated,
    client.getQueryState(expenseKey)?.isInvalidated,
  ];
  return { wrapper, stale };
}

test("scheduling a pre-wedding invalidates the overview and expenses", async () => {
  const { wrapper, stale } = setup();
  const hook = renderHook(() => useSchedulePrewedding(), { wrapper });
  await act(() =>
    hook.result.current.mutateAsync({
      contractId: "c1",
      version: 1,
      body: { date: "2026-10-30" } as never,
    }),
  );
  expect(stale()).toEqual([true, true]);
});

test("cancelling a pre-wedding invalidates the overview and expenses", async () => {
  const { wrapper, stale } = setup();
  const hook = renderHook(() => useCancelPrewedding(), { wrapper });
  await act(() => hook.result.current.mutateAsync({ contractId: "c1", version: 1 }));
  expect(stale()).toEqual([true, true]);
});
