import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { makeExpenseEntry, problem } from "../../../test/fixtures";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";
import { serveExpenses } from "./testData";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

const FEE_ENTRY = (override: boolean) =>
  makeExpenseEntry({
    id: "second:c1",
    source: "second_photographer",
    date: "2026-10-11",
    amount_cents: 60000,
    type_name: "2º fotógrafo",
    type_key: "second_photographer",
    description: "2º fotógrafo · Caio & Duda",
    expense_id: null,
    version: null,
    contract_id: "c1",
    groom_name: "Caio Reis",
    bride_name: "Duda Melo",
    override,
  });

test("the standard fee dialog lists the history newest first and posts a new price", async () => {
  serveExpenses({
    fee: [
      { from_month: "2026-01", amount_cents: 50000 },
      { from_month: "2026-06", amount_cents: 55000 },
    ],
  });
  let sent: unknown;
  server.use(
    http.post("/api/v1/second-photographer-fee/prices", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ prices: [] });
    }),
  );
  const { user } = renderApp("/negocio?aba=despesas");
  const box = await screen.findByRole("region", { name: "Configurações" });
  await user.click(await within(box).findByRole("button", { name: "Alterar" }));
  const dialog = await screen.findByRole("dialog", { name: "2º fotógrafo (padrão)" });
  const items = within(dialog).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("junho 2026");
  expect(items[0]).toHaveTextContent("R$ 550,00");
  expect(items[1]).toHaveTextContent("janeiro 2026");
  expect(within(dialog).getByLabelText("A partir de")).toHaveValue("2026-10");
  await user.type(within(dialog).getByLabelText("Valor"), "600");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(sent).toEqual({ from_month: "2026-10", amount_cents: 60000 }));
});

async function openAdjust(override: boolean) {
  serveExpenses({ entries: [FEE_ENTRY(override)] });
  const view = renderApp("/negocio?aba=despesas");
  await view.user.click(
    await screen.findByRole("button", { name: "Ajustar 2º fotógrafo · Caio & Duda" }),
  );
  return {
    ...view,
    dialog: await screen.findByRole("dialog", { name: "2º fotógrafo · Caio & Duda" }),
  };
}

test("Ajustar PUTs the amount for this wedding", async () => {
  let sent: unknown;
  server.use(
    http.put("/api/v1/contracts/c1/second-photographer-fee", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({});
    }),
  );
  const { user, dialog } = await openAdjust(false);
  expect(within(dialog).queryByRole("button", { name: "Usar o padrão" })).toBeNull();
  const field = within(dialog).getByLabelText("Valor para este casamento");
  expect(field).toHaveValue("600,00");
  await user.clear(field);
  await user.type(field, "700");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(sent).toEqual({ amount_cents: 70000 }));
});

test("Usar o padrão DELETEs the override", async () => {
  let deleted = false;
  server.use(
    http.delete("/api/v1/contracts/c1/second-photographer-fee", () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, dialog } = await openAdjust(true);
  await user.click(within(dialog).getByRole("button", { name: "Usar o padrão" }));
  await waitFor(() => expect(deleted).toBe(true));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("a 409 says the wedding no longer has two photographers", async () => {
  server.use(
    http.put("/api/v1/contracts/c1/second-photographer-fee", () => problem(409, "no second")),
  );
  const { user, dialog } = await openAdjust(false);
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(
    await within(dialog).findByText("Este casamento não tem mais 2 fotógrafos."),
  ).toBeInTheDocument();
});
