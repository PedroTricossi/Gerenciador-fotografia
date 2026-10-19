import { screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { problem } from "../../../test/fixtures";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";
import { TYPE_IDS, makeCost, serveExpenses } from "./testData";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

async function openDialog(costs = [makeCost()]) {
  serveExpenses({ costs });
  const view = renderApp("/negocio?aba=despesas");
  const box = await screen.findByRole("region", { name: "Configurações" });
  await view.user.click(await within(box).findByRole("button", { name: "Gerenciar" }));
  const dialog = await screen.findByRole("dialog", { name: "Despesas fixas" });
  await within(dialog).findByText("Adobe");
  return { ...view, dialog };
}

const rowOf = (dialog: HTMLElement, name: string) =>
  within(dialog).getByText(name).closest("li") as HTMLElement;

test("lists each cost with type, day, current price and the stopped month", async () => {
  const { dialog } = await openDialog([
    makeCost(),
    makeCost({ id: "fc-old", name: "Antiga", end_month: "2026-08", version: 2 }),
  ]);
  expect(rowOf(dialog, "Adobe")).toHaveTextContent("Assinatura · dia 3 · R$ 124,00");
  expect(rowOf(dialog, "Adobe")).not.toHaveTextContent("parada");
  expect(rowOf(dialog, "Antiga")).toHaveTextContent("parada em agosto 2026");
  expect(within(rowOf(dialog, "Antiga")).getByRole("button", { name: "Retomar" })).toBeVisible();
  expect(within(rowOf(dialog, "Antiga")).queryByRole("button", { name: "Parar" })).toBeNull();
});

test("creates a fixed cost with the expected body", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/fixed-costs", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(makeCost({ name: "Adobe 2" }), { status: 201 });
    }),
  );
  const { user, dialog } = await openDialog();
  expect(within(dialog).getByLabelText("Tipo")).toHaveDisplayValue("Assinatura");
  expect(within(dialog).queryByRole("option", { name: "2º fotógrafo" })).toBeNull();
  expect(within(dialog).getByLabelText("Início")).toHaveValue("2026-10");
  await user.type(within(dialog).getByLabelText("Nome"), "Adobe 2");
  await user.type(within(dialog).getByLabelText("Dia"), "3");
  await user.type(within(dialog).getByLabelText("Valor"), "124,00");
  await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
  await waitFor(() =>
    expect(sent).toEqual({
      name: "Adobe 2",
      type_id: TYPE_IDS.assinatura,
      day_of_month: 3,
      start_month: "2026-10",
      amount_cents: 12400,
    }),
  );
});

test("a day outside 1 to 31 is a field error and sends nothing", async () => {
  let posted = false;
  server.use(
    http.post("/api/v1/fixed-costs", () => {
      posted = true;
      return HttpResponse.json(makeCost(), { status: 201 });
    }),
  );
  const { user, dialog } = await openDialog();
  await user.type(within(dialog).getByLabelText("Nome"), "X");
  await user.type(within(dialog).getByLabelText("Dia"), "40");
  await user.type(within(dialog).getByLabelText("Valor"), "10");
  await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
  expect(within(dialog).getByLabelText("Dia")).toHaveAccessibleDescription(/entre 1 e 31/);
  expect(posted).toBe(false);
});

test("Alterar valor posts the new price from the chosen month", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/fixed-costs/fc-adobe/prices", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(makeCost());
    }),
  );
  const { user, dialog } = await openDialog();
  const row = rowOf(dialog, "Adobe");
  await user.click(within(row).getByRole("button", { name: "Alterar valor" }));
  expect(within(row).getByLabelText("A partir de")).toHaveValue("2026-10");
  await user.type(within(row).getByLabelText("Novo valor"), "139,00");
  await user.click(within(row).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(sent).toEqual({ from_month: "2026-10", amount_cents: 13900 }));
});

test("a rejected price month shows on the month field", async () => {
  server.use(
    http.post("/api/v1/fixed-costs/fc-adobe/prices", () =>
      problem(422, "invalid", { errors: [{ field: "from_month", message: "antes do início" }] }),
    ),
  );
  const { user, dialog } = await openDialog();
  const row = rowOf(dialog, "Adobe");
  await user.click(within(row).getByRole("button", { name: "Alterar valor" }));
  await user.type(within(row).getByLabelText("Novo valor"), "139");
  fireEvent.change(within(row).getByLabelText("A partir de"), { target: { value: "2025-01" } });
  await user.click(within(row).getByRole("button", { name: "Salvar" }));
  await waitFor(() =>
    expect(within(row).getByLabelText("A partir de")).toHaveAccessibleDescription(
      "antes do início",
    ),
  );
});

test("Parar posts end_month, defaulting to the current month", async () => {
  let sent: unknown;
  server.use(
    http.post("/api/v1/fixed-costs/fc-adobe/stop", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(makeCost({ end_month: "2026-10" }));
    }),
  );
  const { user, dialog } = await openDialog();
  const row = rowOf(dialog, "Adobe");
  await user.click(within(row).getByRole("button", { name: "Parar" }));
  expect(within(row).getByLabelText("Último mês")).toHaveValue("2026-10");
  await user.click(within(row).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(sent).toEqual({ end_month: "2026-10" }));
});

test("Retomar posts the resume", async () => {
  let resumed = false;
  server.use(
    http.post("/api/v1/fixed-costs/fc-adobe/resume", () => {
      resumed = true;
      return HttpResponse.json(makeCost());
    }),
  );
  const { user, dialog } = await openDialog([makeCost({ end_month: "2026-08" })]);
  await user.click(within(rowOf(dialog, "Adobe")).getByRole("button", { name: "Retomar" }));
  await waitFor(() => expect(resumed).toBe(true));
});

test("Renomear sends the new name with the version", async () => {
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.patch("/api/v1/fixed-costs/fc-adobe", async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("if-match") };
      return HttpResponse.json(makeCost({ name: "Adobe CC" }));
    }),
  );
  const { user, dialog } = await openDialog();
  const row = rowOf(dialog, "Adobe");
  await user.click(within(row).getByRole("button", { name: "Renomear" }));
  const input = within(row).getByLabelText("Novo nome");
  await user.clear(input);
  await user.type(input, "Adobe CC");
  await user.click(within(row).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(sent).toEqual({ body: { name: "Adobe CC" }, ifMatch: '"4"' }));
});

test("Excluir warns about past months before deleting", async () => {
  let ifMatch: string | null = null;
  server.use(
    http.delete("/api/v1/fixed-costs/fc-adobe", ({ request }) => {
      ifMatch = request.headers.get("if-match");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, dialog } = await openDialog();
  await user.click(within(rowOf(dialog, "Adobe")).getByRole("button", { name: "Excluir" }));
  const confirm = await screen.findByRole("dialog", { name: "Excluir despesa fixa?" });
  expect(
    within(confirm).getByText(
      "Excluir remove esta despesa de todos os meses, inclusive os passados.",
    ),
  ).toBeInTheDocument();
  expect(ifMatch).toBeNull();
  await user.click(within(confirm).getByRole("button", { name: "Excluir" }));
  await waitFor(() => expect(ifMatch).toBe('"4"'));
});

test("a stale delete shows the conflict and closes the confirmation", async () => {
  server.use(http.delete("/api/v1/fixed-costs/fc-adobe", () => problem(412, "stale")));
  const { user, dialog } = await openDialog();
  await user.click(within(rowOf(dialog, "Adobe")).getByRole("button", { name: "Excluir" }));
  const confirm = await screen.findByRole("dialog", { name: "Excluir despesa fixa?" });
  await user.click(within(confirm).getByRole("button", { name: "Excluir" }));
  expect(await within(dialog).findByText(/foi alterada em outro lugar/)).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Excluir despesa fixa?" })).toBeNull();
});
