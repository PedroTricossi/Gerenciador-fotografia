import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { ApiError, api, unwrap } from "./client";

test("returns data on success", async () => {
  server.use(http.get("/api/v1/health", () => HttpResponse.json({ status: "ok" })));
  await expect(unwrap(api.GET("/api/v1/health"))).resolves.toEqual({ status: "ok" });
});

test("turns a problem response into an ApiError", async () => {
  server.use(
    http.get("/api/v1/contracts/:id", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Not Found",
          status: 404,
          detail: "contract not found",
          request_id: "r-9",
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  const call = unwrap(
    api.GET("/api/v1/contracts/{contract_id}", {
      params: { path: { contract_id: "6f1c0a52-0000-4000-8000-000000000000" } },
    }),
  );
  await expect(call).rejects.toMatchObject({
    status: 404,
    detail: "contract not found",
    requestId: "r-9",
  });
  await expect(call).rejects.toBeInstanceOf(ApiError);
});

test("a network failure is status 0", async () => {
  server.use(http.get("/api/v1/health", () => HttpResponse.error()));
  await expect(unwrap(api.GET("/api/v1/health"))).rejects.toMatchObject({ status: 0 });
});

test("a 204 resolves with undefined", async () => {
  server.use(http.delete("/api/v1/contracts/:id", () => new HttpResponse(null, { status: 204 })));
  const call = api.DELETE("/api/v1/contracts/{contract_id}", {
    params: { path: { contract_id: "6f1c0a52-0000-4000-8000-000000000000" } },
  });
  await expect(unwrap(call)).resolves.toBeUndefined();
});

test("writes send JSON to the page's own origin", async () => {
  let seen: Request | undefined;
  server.use(
    http.post("/api/v1/contracts/:id/restore", ({ request }) => {
      seen = request;
      return HttpResponse.json({});
    }),
  );
  await unwrap(
    api.POST("/api/v1/contracts/{contract_id}/restore", {
      params: { path: { contract_id: "6f1c0a52-0000-4000-8000-000000000000" } },
    }),
  );
  expect(new URL(seen!.url).origin).toBe(window.location.origin);
});
