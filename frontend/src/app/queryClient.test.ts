import { ApiError } from "../api/client";
import { describeUnexpected, isUnexpected, makeQueryClient } from "./queryClient";

const apiError = (status: number) =>
  new ApiError(status, { title: "x", detail: "y", request_id: `req-${status}` });

test.each([0, 400, 403, 500, 503])("status %i is unexpected", (status) => {
  expect(isUnexpected(apiError(status))).toBe(true);
});

test.each([404, 409, 412, 422, 428])("status %i is handled by the page", (status) => {
  expect(isUnexpected(apiError(status))).toBe(false);
});

test("messages are Portuguese and carry the request id", () => {
  expect(describeUnexpected(apiError(500))).toBe("Erro no servidor. Código: req-500");
  expect(describeUnexpected(apiError(403))).toBe("O servidor recusou o pedido. Código: req-403");
  expect(describeUnexpected(new ApiError(0, null))).toBe("Sem conexão com o servidor.");
  expect(describeUnexpected(new Error("bug"))).toBe("Erro inesperado. Recarregue a página.");
});

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
