import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { makeClient, makeContract, page } from "../test/fixtures";
import { server } from "../test/server";
import { useClients } from "./clients";
import { useCreateContract, useUpdateContract } from "./contracts";

function setup() {
  let listed = 0;
  server.use(
    http.get("/api/v1/clients", () => {
      listed += 1;
      return HttpResponse.json(page([makeClient()]));
    }),
    http.post("/api/v1/contracts", () => HttpResponse.json(makeContract(), { status: 201 })),
    http.patch("/api/v1/contracts/:id", () => HttpResponse.json(makeContract({ version: 2 }))),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, listed: () => listed };
}

test("creating a contract refetches the clients list", async () => {
  const { wrapper, listed } = setup();
  const clients = renderHook(() => useClients(), { wrapper });
  await waitFor(() => expect(clients.result.current.isSuccess).toBe(true));
  expect(listed()).toBe(1);

  const create = renderHook(() => useCreateContract(), { wrapper });
  await act(() => create.result.current.mutateAsync({} as never));
  await waitFor(() => expect(listed()).toBe(2));
});

test("editing a contract refetches the clients list", async () => {
  const { wrapper, listed } = setup();
  const clients = renderHook(() => useClients(), { wrapper });
  await waitFor(() => expect(clients.result.current.isSuccess).toBe(true));

  const update = renderHook(() => useUpdateContract("c1"), { wrapper });
  await act(() =>
    update.result.current.mutateAsync({ version: 1, body: { cancel_prewedding: false } }),
  );
  await waitFor(() => expect(listed()).toBe(2));
});
