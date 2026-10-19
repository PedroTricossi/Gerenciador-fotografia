import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";

function out(date: string, cents: number, entry: Record<string, unknown>) {
  return {
    kind: "out",
    date,
    amount_cents: cents,
    entry: {
      id: `e-${date}-${cents}`,
      source: "manual",
      date,
      amount_cents: cents,
      missing_amount: false,
      type_id: "t",
      type_name: "Assinatura",
      type_key: null,
      description: null,
      expense_id: null,
      version: 1,
      fixed_cost_id: null,
      contract_id: null,
      event_kind: null,
      groom_name: null,
      bride_name: null,
      link_state: null,
      venue_name: null,
      venue_address: null,
      transport_kind: null,
      left_home_at: null,
      distance_tenths: null,
      override: false,
      ...entry,
    },
  };
}

function money(date: string, cents: number, number: number, count: number, names: string[]) {
  return {
    kind: "in",
    date,
    amount_cents: cents,
    contract_id: "c1",
    number,
    count,
    groom_name: names[0] ?? null,
    bride_name: names[1] ?? null,
    contract_deleted: false,
  };
}

const OCTOBER = [
  money("2026-10-02", 99000, 2, 4, ["Bruno", "Ana"]),
  out("2026-10-03", 12400, { source: "fixed", description: "Adobe" }),
  out("2026-10-05", 5000, { source: "fixed", description: "Galeria online" }),
  money("2026-10-10", 297000, 1, 3, ["Caio", "Duda"]),
  out("2026-10-11", 8600, { description: "Uber" }),
  out("2026-10-11", 50000, {
    source: "second_photographer",
    type_name: "2º fotógrafo",
    groom_name: "Caio",
    bride_name: "Duda",
  }),
  out("2026-10-14", 3800, { description: "Café (edição)" }),
];

function serve(overrides: Record<string, unknown> = {}) {
  server.use(
    http.get("/api/v1/overview", ({ request }) => {
      const q = new URL(request.url).searchParams;
      const value = q.get("value");
      return HttpResponse.json({
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        not_started: false,
        in_cents: 396000,
        out_cents: 79800,
        by_type: [],
        missing_fee_count: 0,
        free_today_cents: 0,
        opening_cents: 225800,
        statement: OCTOBER,
        upcoming: [],
        late_cents: 0,
        ...(value === "2026-11" ? { statement: [], in_cents: 0, out_cents: 0 } : {}),
        ...overrides,
      });
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

test("lists the month as a statement with a running balance", async () => {
  serve();
  renderApp("/negocio?aba=extrato");
  const table = await screen.findByRole("table", { name: "Extrato" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Dia", "Descrição", "Entrada", "Saída", "Livre"]);
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(8);
  expect(rows[0]).toHaveTextContent("Saldo anterior");
  expect(rows[0]).toHaveTextContent("2.258,00");
  expect(rows[1]).toHaveTextContent("02Parcela 2/4 · Bruno & Ana990,003.248,00");
  expect(rows[2]).toHaveTextContent("03Adobefixa124,003.124,00");
  expect(rows[6]).toHaveTextContent("2º fotógrafo · Caio & Duda");
  expect(rows[6]).toHaveTextContent("automática");
  expect(rows[7]).toHaveTextContent("14Café (edição)38,005.420,00");
  expect(screen.getByText("Entrou R$ 3.960,00 · Saiu R$ 798,00")).toBeInTheDocument();
});

test("marks an instalment whose contract was deleted", async () => {
  serve({
    statement: [{ ...money("2026-10-02", 99000, 2, 4, []), contract_deleted: true }],
  });
  renderApp("/negocio?aba=extrato");
  expect(await screen.findByText("Parcela 2/4 · (contrato excluído)")).toBeInTheDocument();
});

test("the year view shows dd/mm and a heading row per month", async () => {
  serve({
    statement: [
      money("2026-09-30", 1000, 1, 2, ["Bruno", "Ana"]),
      out("2026-10-03", 500, { description: "Adobe" }),
      out("2026-10-04", 200, { description: "Café" }),
    ],
  });
  renderApp("/negocio?aba=extrato");
  await screen.findByRole("table", { name: "Extrato" });
  await userEvent
    .setup({ advanceTimers: () => {} })
    .click(screen.getByRole("button", { name: "Ano" }));
  const table = await screen.findByRole("table", { name: "Extrato" });
  expect(await within(table).findByText("30/09")).toBeInTheDocument();
  const headings = [within(table).getByText("setembro"), within(table).getByText("outubro")];
  for (const heading of headings) {
    expect(heading.tagName).toBe("TH");
    expect(heading).toHaveAttribute("colspan", "5");
    expect(heading.closest("tr")).toBeInTheDocument();
  }
  expect(within(table).getByText("03/10")).toBeInTheDocument();
});

test("keeps its own period, apart from Resumo's", async () => {
  serve();
  const user = userEvent.setup({ advanceTimers: () => {} });
  renderApp("/negocio?aba=resumo");
  await screen.findByRole("heading", { name: "outubro 2026" });
  await user.click(screen.getByRole("button", { name: "Próximo período" }));
  await screen.findByRole("heading", { name: "novembro 2026" });
  await user.click(screen.getByRole("button", { name: "Extrato" }));
  expect(await screen.findByRole("heading", { name: "outubro 2026" })).toBeInTheDocument();
});

test("says so when nothing happened or the period has not begun", async () => {
  serve({ statement: [], in_cents: 0, out_cents: 0 });
  renderApp("/negocio?aba=extrato");
  expect(await screen.findByText("Nada entrou ou saiu neste período.")).toBeInTheDocument();
});

test("explains a period that has not started", async () => {
  serve({ not_started: true, statement: [] });
  renderApp("/negocio?aba=extrato");
  expect(
    await screen.findByText("Este período ainda não começou — veja Próximos meses."),
  ).toBeInTheDocument();
});
