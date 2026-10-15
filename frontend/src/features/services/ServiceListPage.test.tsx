import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, SERVICES, makeService, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

test("lists active services, and archived ones on request", async () => {
  const { user } = renderApp("/servicos");
  const table = await screen.findByRole("table", { name: "Serviços" });
  expect(within(table).getByText("Cobertura da cerimônia na igreja")).toBeInTheDocument();
  expect(within(table).getByText("R$ 1.200,00")).toBeInTheDocument();
  expect(within(table).queryByText(/Álbum antigo/)).toBeNull();
  const prewedding = within(table).getByRole("row", { name: /Ensaio de pré-wedding/ });
  expect(within(prewedding).getByText("Sim")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Mostrar arquivados"));
  const archived = await screen.findByRole("row", { name: /Álbum antigo/ });
  expect(within(archived).getByRole("button", { name: "Restaurar" })).toBeInTheDocument();
});

test("the nav links to the services screen", async () => {
  server.use(http.get("/api/v1/contracts", () => HttpResponse.json(page([]))));
  const { user } = renderApp("/contratos");
  await user.click(await screen.findByRole("link", { name: "Serviços" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Serviços" })).toBeInTheDocument();
});

test("creates a service", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/services", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(makeService({ id: "new", name: "Drone" }), { status: 201 });
    }),
  );
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByRole("button", { name: "Novo serviço" }));
  const dialog = screen.getByRole("dialog", { name: "Novo serviço" });
  await user.type(within(dialog).getByLabelText("Nome"), "Drone");
  await user.type(within(dialog).getByLabelText("Preço padrão"), "400");
  await user.click(within(dialog).getByLabelText("Ensaio de pré-wedding"));
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Serviço criado")).toBeInTheDocument();
  expect(sent).toEqual({ name: "Drone", default_price_cents: 40000, is_prewedding: true });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("validates before sending", async () => {
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByRole("button", { name: "Novo serviço" }));
  const dialog = screen.getByRole("dialog", { name: "Novo serviço" });
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getAllByText("campo obrigatório")).toHaveLength(2);
});

test("a name conflict shows on the name field", async () => {
  server.use(http.post("/api/v1/services", () => problem(409, "taken")));
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByRole("button", { name: "Novo serviço" }));
  const dialog = screen.getByRole("dialog", { name: "Novo serviço" });
  await user.type(within(dialog).getByLabelText("Nome"), "Diária segundo fotógrafo");
  await user.type(within(dialog).getByLabelText("Preço padrão"), "500");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(
    await within(dialog).findByText("Já existe um serviço ativo com este nome."),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
});

test("edits with If-Match, and a stale version shows a banner", async () => {
  let ifMatch: string | null = null;
  server.use(
    http.patch("/api/v1/services/:id", ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return problem(412, "The service changed since it was loaded");
    }),
  );
  const { user } = renderApp("/servicos");
  const row = await screen.findByRole("row", { name: /Diária segundo fotógrafo/ });
  await user.click(within(row).getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog", { name: "Editar serviço" });
  expect(within(dialog).getByLabelText("Preço padrão")).toHaveValue("500,00");
  await user.clear(within(dialog).getByLabelText("Preço padrão"));
  await user.type(within(dialog).getByLabelText("Preço padrão"), "550");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(
    await within(dialog).findByText(
      "Este serviço foi alterado em outro lugar. Feche e abra de novo para ver a versão atual.",
    ),
  ).toBeInTheDocument();
  expect(ifMatch).toBe('"1"');
});

test("archives and restores from the row", async () => {
  const archived: string[] = [];
  const restored: string[] = [];
  server.use(
    http.post("/api/v1/services/:id/archive", ({ params }) => {
      archived.push(String(params.id));
      return HttpResponse.json(makeService({ archived_at: "2026-10-14T12:00:00Z", version: 2 }));
    }),
    http.post("/api/v1/services/:id/restore", ({ params }) => {
      restored.push(String(params.id));
      return HttpResponse.json(makeService({ id: IDS.serviceArchived }));
    }),
  );
  const { user } = renderApp("/servicos");
  const row = await screen.findByRole("row", { name: /Cobertura da cerimônia/ });
  await user.click(within(row).getByRole("button", { name: "Arquivar" }));
  expect(await screen.findByText("Serviço arquivado")).toBeInTheDocument();

  await user.click(screen.getByLabelText("Mostrar arquivados"));
  const old = await screen.findByRole("row", { name: /Álbum antigo/ });
  await user.click(within(old).getByRole("button", { name: "Restaurar" }));
  expect(await screen.findByText("Serviço restaurado")).toBeInTheDocument();
  await waitFor(() => expect(archived).toEqual([IDS.serviceCeremony]));
  expect(restored).toEqual([IDS.serviceArchived]);
});

test("a restore conflict is explained", async () => {
  server.use(http.post("/api/v1/services/:id/restore", () => problem(409, "taken")));
  const { user } = renderApp("/servicos");
  await user.click(await screen.findByLabelText("Mostrar arquivados"));
  const old = await screen.findByRole("row", { name: /Álbum antigo/ });
  await user.click(within(old).getByRole("button", { name: "Restaurar" }));
  expect(
    await screen.findByText(
      "Não foi possível restaurar: já existe um serviço ativo com este nome, ou ele já foi restaurado.",
    ),
  ).toBeInTheDocument();
});

test("after a stale save, the list refreshes and the next edit sends the new version", async () => {
  let changed = false;
  const ifMatch: (string | null)[] = [];
  server.use(
    http.get("/api/v1/services", () =>
      HttpResponse.json(
        changed
          ? SERVICES.filter((s) => s.archived_at === null).map((s) =>
              s.id === IDS.serviceSecond
                ? { ...s, version: 2, default_price_cents: 55000, name: "Diária 2º fotógrafo" }
                : s,
            )
          : SERVICES.filter((s) => s.archived_at === null),
      ),
    ),
    http.patch("/api/v1/services/:id", ({ request }) => {
      ifMatch.push(request.headers.get("If-Match"));
      if (changed) return HttpResponse.json(makeService({ id: IDS.serviceSecond, version: 3 }));
      changed = true;
      return problem(412, "The service changed since it was loaded");
    }),
  );
  const { user } = renderApp("/servicos");
  const row = await screen.findByRole("row", { name: /Diária segundo fotógrafo/ });
  await user.click(within(row).getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog", { name: "Editar serviço" });
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await within(dialog).findByText(/foi alterado em outro lugar/);
  await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

  const fresh = await screen.findByRole("row", { name: /Diária 2º fotógrafo/ });
  await user.click(within(fresh).getByRole("button", { name: "Editar" }));
  const again = screen.getByRole("dialog", { name: "Editar serviço" });
  await user.click(within(again).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Serviço atualizado")).toBeInTheDocument();
  expect(ifMatch).toEqual(['"1"', '"2"']);
});

test("Cancelar is disabled while a save is pending", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.patch("/api/v1/services/:id", async () => {
      await gate;
      return HttpResponse.json(makeService({ id: IDS.serviceSecond, version: 2 }));
    }),
  );
  const { user } = renderApp("/servicos");
  const row = await screen.findByRole("row", { name: /Diária segundo fotógrafo/ });
  await user.click(within(row).getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog", { name: "Editar serviço" });
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Editar serviço" })).toBeInTheDocument();
  release();
  expect(await screen.findByText("Serviço atualizado")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
