import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { makeExpenseEntry, problem } from "../../../test/fixtures";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";

const ENTRIES = [
  makeExpenseEntry({
    id: "fixed:adobe:2026-10",
    source: "fixed",
    date: "2026-10-03",
    amount_cents: 12400,
    type_name: "Assinatura",
    description: "Adobe",
    expense_id: null,
    version: null,
    fixed_cost_id: "fc-adobe",
  }),
  makeExpenseEntry({
    id: "fixed:galeria:2026-10",
    source: "fixed",
    date: "2026-10-05",
    amount_cents: 5000,
    type_name: "Assinatura",
    description: "Galeria online",
    expense_id: null,
    version: null,
    fixed_cost_id: "fc-galeria",
  }),
  makeExpenseEntry({
    id: "manual:uber",
    date: "2026-10-11",
    amount_cents: 8600,
    type_name: "Transporte",
    type_key: "transport",
    contract_id: "c1",
    event_kind: "wedding",
    groom_name: "Caio Reis",
    bride_name: "Duda Melo",
    link_state: "ok",
    transport_kind: "ride_app",
    left_home_at: "13:30",
    distance_tenths: 320,
  }),
  makeExpenseEntry({
    id: "second:c1",
    source: "second_photographer",
    date: "2026-10-11",
    amount_cents: 50000,
    type_name: "2º fotógrafo",
    type_key: "second_photographer",
    description: "2º fotógrafo · Caio & Duda",
    expense_id: null,
    version: null,
    contract_id: "c1",
  }),
  makeExpenseEntry({
    id: "manual:cafe",
    date: "2026-10-14",
    amount_cents: 3800,
    type_name: "Café",
    description: "Café (edição)",
  }),
];

const FIXED_COSTS = [
  {
    id: "fc-adobe",
    name: "Adobe",
    type_id: "t",
    type_name: "Assinatura",
    day_of_month: 3,
    start_month: "2026-01",
    end_month: null,
    prices: [
      { from_month: "2026-01", amount_cents: 10000 },
      { from_month: "2026-09", amount_cents: 12400 },
    ],
    version: 1,
  },
  {
    id: "fc-galeria",
    name: "Galeria",
    type_id: "t",
    type_name: "Assinatura",
    day_of_month: 5,
    start_month: "2026-01",
    end_month: null,
    prices: [{ from_month: "2026-01", amount_cents: 5000 }],
    version: 1,
  },
  {
    id: "fc-old",
    name: "Antiga",
    type_id: "t",
    type_name: "Assinatura",
    day_of_month: 5,
    start_month: "2026-01",
    end_month: "2026-08",
    prices: [{ from_month: "2026-01", amount_cents: 999 }],
    version: 1,
  },
];

const requested: string[] = [];

function serve(entries = ENTRIES, fee = [{ from_month: "2026-01", amount_cents: 50000 }]) {
  requested.length = 0;
  server.use(
    http.get("/api/v1/expense-entries", ({ request }) => {
      const url = new URL(request.url);
      requested.push(`${url.searchParams.get("from")}..${url.searchParams.get("to")}`);
      return HttpResponse.json({
        entries,
        total_cents: entries.reduce((sum, entry) => sum + entry.amount_cents, 0),
      });
    }),
    http.get("/api/v1/fixed-costs", () => HttpResponse.json(FIXED_COSTS)),
    http.get("/api/v1/second-photographer-fee", () => HttpResponse.json({ prices: fee })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

test("shows the month's five rows in order with tags and the total", async () => {
  serve();
  renderApp("/negocio?aba=despesas");

  expect(await screen.findByRole("heading", { name: "outubro 2026" })).toBeInTheDocument();
  const table = await screen.findByRole("table", { name: /despesas/i });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows).toHaveLength(5);

  expect(rows[0]).toHaveTextContent("03Adobefixa");
  expect(rows[0]).toHaveTextContent("Assinatura");
  expect(rows[0]).toHaveTextContent("R$ 124,00");
  expect(rows[1]).toHaveTextContent("05Galeria onlinefixa");
  expect(rows[1]).toHaveTextContent("R$ 50,00");
  expect(rows[2]).toHaveTextContent(
    "11App (Uber/99) · casamento Caio & Duda · 32 km · saí 13:30Transporte",
  );
  expect(rows[2]).toHaveTextContent("R$ 86,00");
  expect(rows[3]).toHaveTextContent("112º fotógrafo · Caio & Dudaautomática");
  expect(rows[3]).toHaveTextContent("R$ 500,00");
  expect(rows[4]).toHaveTextContent("14Café (edição)Café");
  expect(rows[4]).toHaveTextContent("R$ 38,00");
  for (const row of rows) expect(row).not.toHaveTextContent("prevista");

  expect(screen.getByText("Total de outubro: R$ 798,00")).toBeInTheDocument();
  expect(requested).toEqual(["2026-10..2026-10"]);
});

test("row buttons carry the row's description in their names", async () => {
  serve();
  renderApp("/negocio?aba=despesas");
  expect(await screen.findByRole("button", { name: "Editar Café (edição)" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gerenciar Adobe" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Ajustar 2º fotógrafo · Caio & Duda" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Nova despesa" })).toBeInTheDocument();
});

test("the settings box lists the active fixed costs and the fee in force", async () => {
  serve();
  renderApp("/negocio?aba=despesas");
  const box = await screen.findByRole("region", { name: "Configurações" });
  expect(await within(box).findByText(/Adobe R\$ 124,00/)).toBeInTheDocument();
  expect(within(box).getByText(/Galeria R\$ 50,00/)).toBeInTheDocument();
  expect(within(box).queryByText(/Antiga/)).not.toBeInTheDocument();
  expect(within(box).getByText(/2º fotógrafo \(padrão\): R\$ 500,00/)).toBeInTheDocument();
  expect(within(box).getByRole("button", { name: "Gerenciar" })).toBeInTheDocument();
  expect(within(box).getByRole("button", { name: "Alterar" })).toBeInTheDocument();
});

test("without a standard fee the settings box says it is not set", async () => {
  serve(ENTRIES, []);
  renderApp("/negocio?aba=despesas");
  expect(await screen.findByText(/2º fotógrafo \(padrão\): não definido/)).toBeInTheDocument();
});

test("Próximo mês asks for the next month and Mês anterior goes back", async () => {
  serve();
  const { user } = renderApp("/negocio?aba=despesas");
  await screen.findByText("Total de outubro: R$ 798,00");
  await user.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(await screen.findByRole("heading", { name: "novembro 2026" })).toBeInTheDocument();
  await screen.findByText(/Total de novembro/);
  expect(requested).toContain("2026-11..2026-11");
  await user.click(screen.getByRole("button", { name: "Mês anterior" }));
  expect(await screen.findByRole("heading", { name: "outubro 2026" })).toBeInTheDocument();
});

test("an entry after today is tagged prevista", async () => {
  serve([makeExpenseEntry({ date: "2026-10-25", description: "Lente" })]);
  renderApp("/negocio?aba=despesas");
  const row = (await screen.findByText("Lente")).closest("tr");
  expect(row).toHaveTextContent("prevista");
});

test("a fee without an amount shows sem valor", async () => {
  serve([
    makeExpenseEntry({
      source: "second_photographer",
      type_name: "2º fotógrafo",
      description: "2º fotógrafo · Caio & Duda",
      amount_cents: 0,
      missing_amount: true,
      expense_id: null,
      version: null,
    }),
  ]);
  renderApp("/negocio?aba=despesas");
  const row = (await screen.findByText(/Caio & Duda/)).closest("tr");
  expect(row).toHaveTextContent("— sem valor");
});

test("a transport row whose contract was deleted says so", async () => {
  serve([
    makeExpenseEntry({
      type_name: "Transporte",
      type_key: "transport",
      event_kind: "wedding",
      link_state: "contract_deleted",
      transport_kind: "car",
      distance_tenths: 325,
      left_home_at: "08:00",
    }),
  ]);
  renderApp("/negocio?aba=despesas");
  expect(
    await screen.findByText("Carro · casamento (contrato excluído) · 32,5 km · saí 08:00"),
  ).toBeInTheDocument();
});

test("an empty month says so", async () => {
  serve([]);
  renderApp("/negocio?aba=despesas");
  expect(await screen.findByText("Nenhuma despesa neste mês.")).toBeInTheDocument();
});

test("while the settings load, the box does not claim there are none", async () => {
  serve();
  server.use(
    http.get("/api/v1/fixed-costs", () => new Promise(() => {})),
    http.get("/api/v1/second-photographer-fee", () => new Promise(() => {})),
  );
  renderApp("/negocio?aba=despesas");
  const box = await screen.findByRole("region", { name: "Configurações" });
  expect(within(box).getByRole("status")).toBeInTheDocument();
  expect(within(box).queryByText(/nenhuma/)).not.toBeInTheDocument();
  expect(within(box).queryByText(/não definido/)).not.toBeInTheDocument();
});

test("when the fixed costs fail to load, the box says so instead of nenhuma", async () => {
  serve();
  server.use(http.get("/api/v1/fixed-costs", () => problem(500, "boom")));
  renderApp("/negocio?aba=despesas");
  const box = await screen.findByRole("region", { name: "Configurações" });
  expect(
    await within(box).findByText(/Não foi possível carregar as configurações/),
  ).toBeInTheDocument();
  expect(within(box).queryByText(/nenhuma/)).not.toBeInTheDocument();
});

test("Ajustar on a fee row opens the fee dialog for that couple", async () => {
  serve();
  const { user } = renderApp("/negocio?aba=despesas");
  await user.click(
    await screen.findByRole("button", { name: "Ajustar 2º fotógrafo · Caio & Duda" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "2º fotógrafo · Caio & Duda" });
  expect(within(dialog).getByLabelText("Valor para este casamento")).toBeInTheDocument();
});

test("Alterar opens the standard fee and Tipos de despesa opens the types", async () => {
  serve();
  server.use(http.get("/api/v1/expense-types", () => HttpResponse.json([])));
  const { user } = renderApp("/negocio?aba=despesas");
  const box = await screen.findByRole("region", { name: "Configurações" });
  await user.click(await within(box).findByRole("button", { name: "Alterar" }));
  await user.click(await screen.findByRole("button", { name: "Cancelar" }));
  await user.click(within(box).getByRole("button", { name: "Tipos de despesa" }));
  expect(await screen.findByRole("dialog", { name: "Tipos de despesa" })).toBeInTheDocument();
});

test("Gerenciar on a fixed row opens the Despesas fixas dialog", async () => {
  serve();
  server.use(http.get("/api/v1/expense-types", () => HttpResponse.json([])));
  const { user } = renderApp("/negocio?aba=despesas");
  await user.click(await screen.findByRole("button", { name: "Gerenciar Adobe" }));
  expect(await screen.findByRole("dialog", { name: "Despesas fixas" })).toBeInTheDocument();
});
