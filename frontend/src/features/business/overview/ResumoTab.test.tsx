import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";

const TYPES = [
  { type_id: "t1", type_name: "2º fotógrafo", palette_slot: 0, amount_cents: 50000 },
  { type_id: "t2", type_name: "Transporte", palette_slot: 1, amount_cents: 8600 },
  { type_id: "t3", type_name: "Assinatura", palette_slot: 2, amount_cents: 17400 },
  { type_id: "t4", type_name: "Café", palette_slot: 3, amount_cents: 3800 },
];

function makeOverview(overrides: Record<string, unknown> = {}) {
  return {
    period_start: "2026-10-01",
    period_end: "2026-10-31",
    not_started: false,
    in_cents: 396000,
    out_cents: 79800,
    by_type: TYPES,
    missing_fee_count: 0,
    free_today_cents: 542000,
    opening_cents: 0,
    statement: [],
    upcoming: [
      {
        month: "2026-10",
        rest_of_month: true,
        in_cents: 1000,
        out_cents: 500,
        projected_free_cents: 542500,
      },
      {
        month: "2026-11",
        rest_of_month: false,
        in_cents: 200000,
        out_cents: 67400,
        projected_free_cents: 674600,
      },
    ],
    late_cents: 0,
    ...overrides,
  };
}

const requested: string[] = [];

function serve(overrides: Record<string, unknown> = {}) {
  requested.length = 0;
  server.use(
    http.get("/api/v1/overview", ({ request }) => {
      const q = new URL(request.url).searchParams;
      requested.push(`${q.get("period")}=${q.get("value")}`);
      return HttpResponse.json(makeOverview(overrides));
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

test("shows the three totals, the bar legend and the months ahead", async () => {
  serve();
  renderApp("/negocio?aba=resumo");
  expect(await screen.findByText("R$ 3.960,00")).toBeInTheDocument();
  expect(screen.getByText("R$ 798,00")).toBeInTheDocument();
  expect(screen.getByText("Livre no mês")).toBeInTheDocument();
  expect(screen.getByText("R$ 3.162,00")).toBeInTheDocument();
  expect(screen.getByText("2º fotógrafo 12,6% · R$ 500,00")).toBeInTheDocument();
  expect(screen.getByText("Livre 79,8% · R$ 3.162,00")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Para onde foi o que entrou" })).toBeInTheDocument();
  expect(screen.getByText("R$ 5.420,00")).toBeInTheDocument();

  const table = screen.getByRole("table", { name: "Próximos meses" });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows[0]).toHaveTextContent("resto de outubro");
  expect(rows[1]).toHaveTextContent("novembro");
  expect(
    screen.getByText(
      "A receber = parcelas não pagas do mês · A pagar = despesas fixas, 2º fotógrafo e despesas lançadas com data futura.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Parcelas atrasadas não contadas/)).not.toBeInTheDocument();
});

test("when more went out than came in it warns and lists amounts without percentages", async () => {
  serve({
    in_cents: 60000,
    out_cents: 80000,
    by_type: [TYPES[0]!, { ...TYPES[1]!, amount_cents: 30000 }],
  });
  renderApp("/negocio?aba=resumo");
  expect(
    await screen.findByText("Saiu mais do que entrou neste período: R$ 200,00 a mais"),
  ).toBeInTheDocument();
  expect(screen.getByText("2º fotógrafo · R$ 500,00")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Para onde foi o que entrou" })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("%");
});

test("a period with nothing in or out says so", async () => {
  serve({ in_cents: 0, out_cents: 0, by_type: [] });
  renderApp("/negocio?aba=resumo");
  expect(await screen.findByText("Nada entrou ou saiu neste período.")).toBeInTheDocument();
});

test("a type without a palette slot is folded into Outros", async () => {
  serve({
    by_type: [
      { type_id: "a", type_name: "Livros", palette_slot: null, amount_cents: 10000 },
      { type_id: "b", type_name: "Cursos", palette_slot: null, amount_cents: 20000 },
    ],
    out_cents: 30000,
    in_cents: 100000,
  });
  renderApp("/negocio?aba=resumo");
  expect(await screen.findByText("Outros 30,0% · R$ 300,00")).toBeInTheDocument();
  expect(screen.queryByText(/Livros/)).not.toBeInTheDocument();
});

test("Próximo período asks for the next month and Ano asks for the year", async () => {
  serve();
  const { user } = renderApp("/negocio?aba=resumo");
  await screen.findByText("R$ 3.960,00");
  await user.click(screen.getByRole("button", { name: "Próximo período" }));
  await screen.findByRole("heading", { name: "novembro 2026" });
  expect(requested).toContain("month=2026-11");
  await user.click(screen.getByRole("button", { name: "Ano" }));
  await screen.findByRole("heading", { name: "2026" });
  expect(requested).toContain("year=2026");
  expect(await screen.findByText("Livre no ano")).toBeInTheDocument();
});

test("a period that has not started shows the message but keeps Livre hoje and the months ahead", async () => {
  serve({ not_started: true, in_cents: 0, out_cents: 0, by_type: [] });
  renderApp("/negocio?aba=resumo");
  expect(
    await screen.findByText("Este período ainda não começou — veja Próximos meses."),
  ).toBeInTheDocument();
  expect(screen.queryByText("Entrou")).not.toBeInTheDocument();
  expect(screen.getByText("R$ 5.420,00")).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Próximos meses" })).toBeInTheDocument();
});

test("the late note links to the instalments only when something is late", async () => {
  serve({ late_cents: 123400 });
  renderApp("/negocio?aba=resumo");
  expect(
    await screen.findByText(/Parcelas atrasadas não contadas: R\$ 1\.234,00/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver parcelas" })).toHaveAttribute("href", "/negocio");
});

test("a negative Livre hoje shows a minus sign and the warning icon", async () => {
  serve({ free_today_cents: -15000 });
  renderApp("/negocio?aba=resumo");
  const value = await screen.findByText(/−R\$ 150,00/);
  expect(value).toHaveTextContent("⚠");
  expect(value.className).toMatch(/negative/);
});

test("notes the contracts missing a second-photographer fee", async () => {
  serve({ missing_fee_count: 2 });
  renderApp("/negocio?aba=resumo");
  expect(
    await screen.findByText("Há 2 casamento(s) com 2º fotógrafo sem valor definido"),
  ).toBeInTheDocument();
});
