import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { problem } from "../../../test/fixtures";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";
import { TYPE_IDS, baseTypes, serveExpenses } from "./testData";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

async function openDialog(types = baseTypes()) {
  serveExpenses({ types });
  const view = renderApp("/negocio?aba=despesas");
  await view.user.click(await screen.findByRole("button", { name: "Tipos de despesa" }));
  const dialog = await screen.findByRole("dialog", { name: "Tipos de despesa" });
  await within(dialog).findByText("Café");
  return { ...view, dialog, types };
}

const rowOf = (dialog: HTMLElement, name: string) =>
  within(dialog).getByText(name).closest("li") as HTMLElement;

test("keyed types have no Arquivar and say the system uses them", async () => {
  const { dialog } = await openDialog();
  for (const name of ["Transporte", "2º fotógrafo"]) {
    const row = rowOf(dialog, name);
    expect(within(row).queryByRole("button", { name: "Arquivar" })).toBeNull();
    expect(row).toHaveTextContent("usado pelo sistema");
  }
  expect(within(rowOf(dialog, "Café")).getByRole("button", { name: "Arquivar" })).toBeVisible();
});

test("archiving Café moves it under Arquivados and Restaurar brings it back", async () => {
  const types = baseTypes();
  server.use(
    http.post(`/api/v1/expense-types/${TYPE_IDS.cafe}/archive`, () => {
      const cafe = types.find((type) => type.id === TYPE_IDS.cafe)!;
      cafe.archived_at = "2026-10-20T10:00:00Z";
      return HttpResponse.json(cafe);
    }),
    http.post(`/api/v1/expense-types/${TYPE_IDS.cafe}/restore`, () => {
      const cafe = types.find((type) => type.id === TYPE_IDS.cafe)!;
      cafe.archived_at = null;
      return HttpResponse.json(cafe);
    }),
  );
  const { user, dialog } = await openDialog(types);
  expect(within(dialog).queryByRole("heading", { name: "Arquivados" })).toBeNull();
  await user.click(within(rowOf(dialog, "Café")).getByRole("button", { name: "Arquivar" }));
  const archived = await within(dialog).findByRole("heading", { name: "Arquivados" });
  const list = archived.nextElementSibling as HTMLElement;
  expect(within(list).getByText("Café")).toBeInTheDocument();
  await user.click(within(rowOf(dialog, "Café")).getByRole("button", { name: "Restaurar" }));
  await waitFor(() =>
    expect(within(dialog).queryByRole("heading", { name: "Arquivados" })).toBeNull(),
  );
});

test("adding a duplicate name shows the 409 message", async () => {
  server.use(http.post("/api/v1/expense-types", () => problem(409, "duplicate")));
  const { user, dialog } = await openDialog();
  await user.type(within(dialog).getByLabelText("Novo tipo"), "Café");
  await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
  await waitFor(() =>
    expect(within(dialog).getByLabelText("Novo tipo")).toHaveAccessibleDescription(
      "Já existe um tipo com esse nome.",
    ),
  );
});

test("adding a type posts its name", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/expense-types", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(baseTypes()[3], { status: 201 });
    }),
  );
  const { user, dialog } = await openDialog();
  await user.type(within(dialog).getByLabelText("Novo tipo"), "Hospedagem");
  await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
  await waitFor(() => expect(sent).toEqual({ name: "Hospedagem" }));
});

test("Renomear patches the name with the version", async () => {
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.patch(`/api/v1/expense-types/${TYPE_IDS.cafe}`, async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("if-match") };
      return HttpResponse.json(baseTypes()[3]);
    }),
  );
  const { user, dialog } = await openDialog();
  const row = rowOf(dialog, "Café");
  await user.click(within(row).getByRole("button", { name: "Renomear" }));
  const input = within(row).getByLabelText("Novo nome");
  await user.clear(input);
  await user.type(input, "Lanche");
  await user.click(within(row).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(sent).toEqual({ body: { name: "Lanche" }, ifMatch: '"1"' }));
});
