import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../test/server";
import { useDeleteContract, useRestoreContract, useUpdateContract } from "./contracts";
import { makeContract } from "../test/fixtures";
import { overviewKeys } from "./overview";

function setup() {
  server.use(
    http.delete("/api/v1/contracts/:id", () => new HttpResponse(null, { status: 204 })),
    http.patch("/api/v1/contracts/:id", () => HttpResponse.json(makeContract({ version: 2 }))),
    http.post("/api/v1/contracts/:id/restore", () => HttpResponse.json(makeContract())),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(overviewKeys.overview("month", "2026-10", "2026-10-20"), { stale: false });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const stale = () =>
    client.getQueryState(overviewKeys.overview("month", "2026-10", "2026-10-20"))?.isInvalidated;
  return { wrapper, stale };
}

test("deleting a contract invalidates the overview", async () => {
  const { wrapper, stale } = setup();
  const hook = renderHook(() => useDeleteContract(), { wrapper });
  await act(() => hook.result.current.mutateAsync("c1"));
  expect(stale()).toBe(true);
});

test("restoring a contract invalidates the overview", async () => {
  const { wrapper, stale } = setup();
  const hook = renderHook(() => useRestoreContract(), { wrapper });
  await act(() => hook.result.current.mutateAsync("c1"));
  expect(stale()).toBe(true);
});

test("editing a contract invalidates the overview", async () => {
  const { wrapper, stale } = setup();
  const hook = renderHook(() => useUpdateContract("c1"), { wrapper });
  await act(() =>
    hook.result.current.mutateAsync({ version: 1, body: { cancel_prewedding: false } }),
  );
  expect(stale()).toBe(true);
});
