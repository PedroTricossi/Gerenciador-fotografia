import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeClient, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const masked = (overrides = {}) => makeClient({ cpf: "***.***.***-09", ...overrides });
const anonymised = makeClient({
  id: IDS.bride,
  full_name: null,
  cpf: null,
  address: null,
  anonymised_at: "2026-10-14T09:00:00Z",
});

test("lists clients with masked CPF, date and status", async () => {
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([masked(), anonymised]))));
  renderApp("/clientes");
  const active = await screen.findByRole("row", { name: /Bruno Costa/ });
  expect(active).toHaveTextContent("***.***.***-09");
  expect(active).toHaveTextContent("13/10/2026");
  expect(active).toHaveTextContent("Ativo");

  const gone = screen.getByRole("row", { name: /Cliente anonimizado/ });
  expect(gone).toHaveTextContent("Anonimizado");
  expect(within(gone).queryByRole("button")).not.toBeInTheDocument();
});

test("an empty list says so", async () => {
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  renderApp("/clientes");
  expect(await screen.findByText("Nenhum cliente ainda")).toBeInTheDocument();
});

test("Exportar dados saves the export as JSON", async () => {
  const exported = { client: makeClient(), contracts: [], exported_at: "2026-10-14T10:00:00Z" };
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  server.use(
    http.get("/api/v1/clients", () => HttpResponse.json(page([masked()]))),
    http.get("/api/v1/clients/:id/export", () => HttpResponse.json(exported)),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Exportar dados" }));

  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]!.download).toBe(`cliente-${IDS.groom}.json`);
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
  // jsdom's Blob has no text(), so read it with FileReader.
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  expect(JSON.parse(text)).toEqual(exported);
  expect(text).toBe(JSON.stringify(exported, null, 2));
});

test("Exportar dados on a client that no longer exists says so", async () => {
  server.use(
    http.get("/api/v1/clients", () => HttpResponse.json(page([masked()]))),
    http.get("/api/v1/clients/:id/export", () => problem(404, "client not found")),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Exportar dados" }));

  expect(await screen.findByText("Este cliente não existe mais.")).toBeInTheDocument();
});

test("Anonimizar needs the typed word, then the row turns anonymised", async () => {
  let done = false;
  server.use(
    http.get("/api/v1/clients", () =>
      HttpResponse.json(page([done ? { ...anonymised, id: IDS.groom } : masked()])),
    ),
    http.post("/api/v1/clients/:id/anonymise", () => {
      done = true;
      return HttpResponse.json({ ...anonymised, id: IDS.groom });
    }),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Anonimizar" }));

  const dialog = screen.getByRole("dialog", { name: "Anonimizar cliente" });
  expect(dialog).toHaveTextContent("Esta ação não pode ser desfeita.");
  const confirm = within(dialog).getByRole("button", { name: "Anonimizar" });
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(confirm);

  expect(await screen.findByText("Cliente anonimizado com sucesso")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(await screen.findByRole("row", { name: /Anonimizado/ })).toBeInTheDocument();
});

test("a client on an active contract cannot be anonymised, and the dialog says why", async () => {
  server.use(
    http.get("/api/v1/clients", () => HttpResponse.json(page([masked()]))),
    http.post("/api/v1/clients/:id/anonymise", () => problem(409, "client has an active contract")),
  );
  const { user } = renderApp("/clientes");
  const row = await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(within(row).getByRole("button", { name: "Anonimizar" }));
  const dialog = screen.getByRole("dialog", { name: "Anonimizar cliente" });
  await user.type(within(dialog).getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(within(dialog).getByRole("button", { name: "Anonimizar" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Este cliente está em um contrato que não foi excluído. Exclua o contrato antes de anonimizar.",
  );
  expect(screen.getByRole("dialog", { name: "Anonimizar cliente" })).toBeInTheDocument();
});

test("Carregar mais fetches the next page", async () => {
  server.use(
    http.get("/api/v1/clients", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json(cursor === "c2" ? page([anonymised]) : page([masked()], "c2"));
    }),
  );
  const { user } = renderApp("/clientes");
  await screen.findByRole("row", { name: /Bruno Costa/ });
  await user.click(screen.getByRole("button", { name: "Carregar mais" }));
  expect(await screen.findByRole("row", { name: /Cliente anonimizado/ })).toBeInTheDocument();
});
