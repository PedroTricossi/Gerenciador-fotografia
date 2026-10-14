import { ApiError } from "../api/client";
import { makeQueryClient } from "./queryClient";

const apiError = (status: number) =>
  new ApiError(status, { title: "x", detail: "y", request_id: `req-${status}` });

test("failed queries report only unexpected errors", async () => {
  const onUnexpected = vi.fn();
  const client = makeQueryClient(onUnexpected, false);
  await expect(
    client.fetchQuery({ queryKey: ["a"], queryFn: () => Promise.reject(apiError(500)) }),
  ).rejects.toBeInstanceOf(ApiError);
  await expect(
    client.fetchQuery({ queryKey: ["b"], queryFn: () => Promise.reject(apiError(404)) }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(onUnexpected).toHaveBeenCalledOnce();
  expect(onUnexpected).toHaveBeenCalledWith("Erro no servidor. Código: req-500");
});
