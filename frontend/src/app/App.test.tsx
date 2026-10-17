import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { page } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

beforeEach(() => {
  server.use(
    http.get("/api/v1/agenda", () => HttpResponse.json([])),
    http.get("/api/v1/contracts", () => HttpResponse.json(page([]))),
    http.get("/api/v1/clients", () => HttpResponse.json(page([]))),
  );
});

test("the root redirects to the agenda", async () => {
  const { router } = renderApp("/");
  expect(await screen.findByRole("heading", { level: 1, name: "Agenda" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/agenda");
});

test("the agenda comes first in the nav", () => {
  renderApp("/contratos");
  const nav = screen.getByRole("navigation", { name: "Principal" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Agenda", "Contratos", "Clientes", "Serviços", "Negócio"]);
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
  await user.click(screen.getByRole("link", { name: "Ir para a agenda" }));
  expect(router.state.location.pathname).toBe("/agenda");
});
