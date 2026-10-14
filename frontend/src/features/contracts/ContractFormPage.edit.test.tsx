import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const URL_PATH = `/contratos/${IDS.contract}`;
const EVENT_REQUEST = {
  date: "2027-03-14",
  venue_name: "Capela",
  venue_address: null,
  coverage_start: "16:00",
  coverage_end: null,
  hours_contracted: null,
};

function serveContract(contract = makeContract()) {
  server.use(http.get("/api/v1/contracts/:id", () => HttpResponse.json(contract)));
}

test("loads the contract into the form with nothing to save yet", async () => {
  serveContract();
  renderApp(URL_PATH);
  expect(await screen.findByRole("heading", { level: 1, name: "Bruno & Ana" })).toBeInTheDocument();
  expect(screen.getByLabelText("Nome do noivo")).toHaveValue("Bruno Costa");
  expect(screen.getByLabelText("CPF da noiva")).toHaveValue("987.654.321-00");
  expect(screen.getByLabelText("Valor do item 1")).toHaveValue("1.200,00");
  expect(screen.getByLabelText("Desconto PIX")).toHaveValue("300,00");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("saving sends only the changed section with If-Match", async () => {
  serveContract();
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("If-Match") };
      return HttpResponse.json(
        makeContract({ version: 2, event: { ...makeContract().event, venue_name: "Capela" } }),
      );
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Capela");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent).toEqual({ body: { event: EVENT_REQUEST }, ifMatch: '"1"' });
  expect(screen.getByLabelText("Local do evento")).toHaveValue("Capela");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("retyping the same amount differently is not a change", async () => {
  serveContract();
  const { user } = renderApp(URL_PATH);
  const amount = await screen.findByLabelText("Valor do item 1");
  await user.clear(amount);
  await user.type(amount, "1200");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("a changed item list is sent whole", async () => {
  serveContract();
  let body: unknown;
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeContract({ version: 2 }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  await user.click(await screen.findByRole("button", { name: "Remover item 2" }));
  await user.clear(screen.getByLabelText("Desconto PIX"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByText("Alterações salvas");
  expect(body).toEqual({
    payment: {
      items: [{ description: "Cobertura da cerimônia na igreja", amount_cents: 120000 }],
      pix_discount_cents: null,
    },
  });
});

test("a stale version offers a reload that discards the edits", async () => {
  let version = 1;
  server.use(
    http.get("/api/v1/contracts/:id", () =>
      HttpResponse.json(
        version === 1
          ? makeContract()
          : makeContract({
              version: 2,
              event: { ...makeContract().event, venue_name: "Capela Nova" },
            }),
      ),
    ),
    http.patch("/api/v1/contracts/:id", () => {
      version = 2;
      return problem(412, "Precondition Failed");
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Minha edição");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  const dialog = await screen.findByRole("dialog", { name: "Contrato alterado" });
  expect(dialog).toHaveTextContent("Este contrato foi alterado em outro lugar.");
  await user.click(screen.getByRole("button", { name: "Recarregar" }));
  await waitFor(() => expect(screen.getByLabelText("Local do evento")).toHaveValue("Capela Nova"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("a deleted contract is read-only until restored", async () => {
  serveContract(makeContract({ deleted_at: "2026-10-14T10:00:00Z" }));
  server.use(http.post("/api/v1/contracts/:id/restore", () => HttpResponse.json(makeContract())));
  const { user } = renderApp(URL_PATH);
  expect(await screen.findByText(/Este contrato foi excluído/)).toBeInTheDocument();
  expect(screen.getByLabelText("Nome do noivo")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Restaurar" }));
  await waitFor(() => expect(screen.getByLabelText("Nome do noivo")).toBeEnabled());
  expect(screen.getByText("Contrato restaurado")).toBeInTheDocument();
});

test("a missing contract says so", async () => {
  server.use(http.get("/api/v1/contracts/:id", () => problem(404, "contract not found")));
  renderApp(URL_PATH);
  expect(
    await screen.findByRole("heading", { level: 1, name: "Contrato não encontrado" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para contratos" })).toBeInTheDocument();
});

test("leaving with unsaved changes asks first", async () => {
  serveContract();
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.type(venue, " editado");

  await user.click(screen.getByRole("link", { name: "Clientes" }));
  expect(screen.getByRole("dialog", { name: "Descartar alterações?" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(router.state.location.pathname).toBe(URL_PATH);
  expect(screen.getByLabelText("Local do evento")).toHaveValue("Igreja Matriz editado");

  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/clientes"));
});

test("leaving without changes does not ask", async () => {
  serveContract();
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp(URL_PATH);
  await screen.findByLabelText("Local do evento");
  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/clientes"));
});

test("Baixar PDF waits for unsaved changes to be saved", async () => {
  serveContract();
  const clicked = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  server.use(
    http.get(
      "/api/v1/contracts/:id/pdf",
      () =>
        new HttpResponse(new Blob(["%PDF"]), { headers: { "Content-Type": "application/pdf" } }),
    ),
  );
  const { user } = renderApp(URL_PATH);
  const download = await screen.findByRole("button", { name: "Baixar PDF" });
  expect(download).toBeEnabled();

  await user.type(screen.getByLabelText("Local do evento"), "!");
  expect(download).toBeDisabled();
  expect(screen.getByText("Salve as alterações antes de baixar o PDF.")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Local do evento"), "{Backspace}");
  expect(download).toBeEnabled();
  await user.click(download);
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
});

test("Baixar PDF on a contract deleted elsewhere says so", async () => {
  serveContract();
  server.use(http.get("/api/v1/contracts/:id/pdf", () => problem(409, "contract is deleted")));
  const { user } = renderApp(URL_PATH);
  await user.click(await screen.findByRole("button", { name: "Baixar PDF" }));
  expect(
    await screen.findByText("Este contrato foi excluído. Restaure-o para baixar o PDF."),
  ).toBeInTheDocument();
});
