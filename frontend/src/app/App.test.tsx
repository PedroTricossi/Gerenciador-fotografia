import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { page } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

beforeEach(() => {
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([]))),
    http.get("/api/v1/clients", () => HttpResponse.json(page([]))),
  );
});

test("the root redirects to the contract list", async () => {
  const { router } = renderApp("/");
  expect(await screen.findByRole("heading", { level: 1, name: "Contratos" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/contratos");
});

test("the nav moves between contracts and clients", async () => {
  const { user, router } = renderApp("/contratos");
  const nav = screen.getByRole("navigation", { name: "Principal" });
  await user.click(screen.getByRole("link", { name: "Clientes" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Clientes" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/clientes");
  expect(nav).toBeInTheDocument();
});

test("an unknown path shows a not-found page with a way back", async () => {
  const { user, router } = renderApp("/nada-aqui");
  expect(
    screen.getByRole("heading", { level: 1, name: "Página não encontrada" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Ir para contratos" }));
  expect(router.state.location.pathname).toBe("/contratos");
});
