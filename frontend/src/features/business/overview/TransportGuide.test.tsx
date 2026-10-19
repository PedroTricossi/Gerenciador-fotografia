import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";

const TRIP = {
  contract_id: "c1",
  event_kind: "wedding",
  date: "2026-08-15",
  cost_cents: 8000,
  distance_tenths: 325,
  left_home_at: "13:30",
  transport_kind: "ride_app",
  groom_name: "Ana",
  bride_name: "Bia",
  contract_deleted: false,
};

function makeGuide(overrides: Record<string, unknown> = {}) {
  return {
    trips_total: 4,
    similar: [],
    typical_cents: null,
    min_cents: null,
    max_cents: null,
    per_km_by_kind: [
      { transport_kind: "car", cents_per_km: 210 },
      { transport_kind: "ride_app", cents_per_km: 270 },
    ],
    day_cents_per_km: null,
    night_cents_per_km: null,
    ...overrides,
  };
}

const queries: URLSearchParams[] = [];

function serve(overrides: Record<string, unknown> = {}) {
  queries.length = 0;
  server.use(
    http.get("/api/v1/overview", () =>
      HttpResponse.json({
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        not_started: false,
        in_cents: 0,
        out_cents: 0,
        by_type: [],
        missing_fee_count: 0,
        free_today_cents: 0,
        opening_cents: 0,
        statement: [],
        upcoming: [],
        late_cents: 0,
      }),
    ),
    http.get("/api/v1/transport-guide", ({ request }) => {
      queries.push(new URL(request.url).searchParams);
      return HttpResponse.json(makeGuide(overrides));
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

async function open() {
  renderApp("/negocio?aba=resumo");
  return await screen.findByText("Guia de transporte");
}

test("with no trips it shows the empty state and no form", async () => {
  serve({ trips_total: 0, per_km_by_kind: [] });
  await open();
  expect(
    await screen.findByText("Registre o transporte dos casamentos em Despesas para ver o guia."),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Distância (km)")).not.toBeInTheDocument();
});

test("shows the per-kind and day/night lines on mount", async () => {
  serve({ day_cents_per_km: 200, night_cents_per_km: 300 });
  await open();
  expect(
    await screen.findByText("Carro R$ 2,10/km · App (Uber/99) R$ 2,70/km"),
  ).toBeInTheDocument();
  expect(screen.getByText("Dia R$ 2,00/km · Noite R$ 3,00/km")).toBeInTheDocument();
  expect(queries[0]!.has("distance_tenths")).toBe(false);
});

test("submitting a distance and a time asks for that estimate", async () => {
  serve({ similar: [TRIP] });
  const user = userEvent.setup();
  await open();
  await user.type(await screen.findByLabelText("Distância (km)"), "32");
  await user.click(screen.getByRole("button", { name: "Ver estimativa" }));
  await waitFor(() => expect(queries.at(-1)!.get("distance_tenths")).toBe("320"));
  await screen.findByText("Poucas viagens registradas ainda");
  expect(queries.at(-1)!.has("left_home_at")).toBe(false);

  await user.type(screen.getByLabelText("Saída de casa"), "13:30");
  await user.click(screen.getByRole("button", { name: "Ver estimativa" }));
  await waitFor(() => expect(queries.at(-1)!.get("left_home_at")).toBe("13:30"));
});

test("shows the typical cost with its range and the similar trips", async () => {
  serve({ similar: [TRIP], typical_cents: 8000, min_cents: 6000, max_cents: 10000 });
  const user = userEvent.setup();
  await open();
  await user.type(await screen.findByLabelText("Distância (km)"), "32");
  await user.click(screen.getByRole("button", { name: "Ver estimativa" }));
  expect(
    await screen.findByText(
      "Viagens parecidas: 1 · custo típico R$ 80,00 (de R$ 60,00 a R$ 100,00)",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText("15/08/2026 · Ana & Bia · 32,5 km · saí 13:30 · App (Uber/99) · R$ 80,00"),
  ).toBeInTheDocument();
});

test("few trips say so and still list them, marking a deleted contract", async () => {
  serve({ similar: [{ ...TRIP, contract_deleted: true }] });
  const user = userEvent.setup();
  await open();
  await user.type(await screen.findByLabelText("Distância (km)"), "32");
  await user.click(screen.getByRole("button", { name: "Ver estimativa" }));
  expect(await screen.findByText("Poucas viagens registradas ainda")).toBeInTheDocument();
  expect(screen.getByText(/\(contrato excluído\)/)).toBeInTheDocument();
});

test("an invalid distance shows the field error and sends nothing", async () => {
  serve();
  const user = userEvent.setup();
  await open();
  await user.type(await screen.findByLabelText("Distância (km)"), "32,55");
  await user.click(screen.getByRole("button", { name: "Ver estimativa" }));
  expect(await screen.findByText("distância inválida")).toBeInTheDocument();
  expect(queries).toHaveLength(1);
});

async function submitKm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Distância (km)"), "32");
  await user.click(screen.getByRole("button", { name: "Ver estimativa" }));
}

test("while the estimate loads it never claims there are few trips", async () => {
  serve();
  server.use(
    http.get("/api/v1/transport-guide", ({ request }) => {
      if (new URL(request.url).searchParams.has("distance_tenths")) return new Promise(() => {});
      return HttpResponse.json(makeGuide());
    }),
  );
  const user = userEvent.setup();
  await open();
  await submitKm(user);
  expect(await screen.findByText("Carregando…")).toBeInTheDocument();
  expect(screen.queryByText("Poucas viagens registradas ainda")).not.toBeInTheDocument();
});

test("a failed estimate shows an error, not the few-trips text", async () => {
  serve();
  server.use(
    http.get("/api/v1/transport-guide", ({ request }) =>
      new URL(request.url).searchParams.has("distance_tenths")
        ? HttpResponse.json({ detail: "x" }, { status: 500 })
        : HttpResponse.json(makeGuide()),
    ),
  );
  const user = userEvent.setup();
  await open();
  await submitKm(user);
  expect(await screen.findByText("Não foi possível carregar a estimativa.")).toBeInTheDocument();
  expect(screen.queryByText("Poucas viagens registradas ainda")).not.toBeInTheDocument();
});

test("trips on the other side of 18:00 are tagged, not dropped", async () => {
  serve({
    similar: [
      { ...TRIP, left_home_at: "19:00" },
      { ...TRIP, contract_id: "c2", left_home_at: "09:00" },
      { ...TRIP, contract_id: "c3", left_home_at: null },
    ],
  });
  const user = userEvent.setup();
  await open();
  await user.type(await screen.findByLabelText("Saída de casa"), "09:30");
  await submitKm(user);
  const rows = within(await screen.findByRole("list", { name: "Viagens parecidas" })).getAllByRole(
    "listitem",
  );
  expect(rows[0]).toHaveTextContent(/saí 19:00.*· noite$/);
  expect(rows[1]).not.toHaveTextContent(/· (noite|dia)$/);
  expect(rows[2]).toHaveTextContent(/· sem horário$/);
  expect(rows[2]).not.toHaveTextContent(/noite/);
});

test("without a typed time, trips without a departure get no tag", async () => {
  serve({ similar: [{ ...TRIP, left_home_at: null }] });
  const user = userEvent.setup();
  await open();
  await submitKm(user);
  expect(await screen.findByRole("list", { name: "Viagens parecidas" })).not.toHaveTextContent(
    "sem horário",
  );
});

test("couples show first names only, and anonymised ones are labelled as such", async () => {
  serve({
    similar: [
      { ...TRIP, groom_name: "Ana Souza", bride_name: "Bia Lima" },
      { ...TRIP, contract_id: "c2", groom_name: null, bride_name: null },
    ],
  });
  const user = userEvent.setup();
  await open();
  await submitKm(user);
  const rows = within(await screen.findByRole("list", { name: "Viagens parecidas" })).getAllByRole(
    "listitem",
  );
  expect(rows[0]).toHaveTextContent("Ana & Bia");
  expect(rows[0]).not.toHaveTextContent("Souza");
  expect(rows[1]).toHaveTextContent("Clientes anonimizados");
});

test("while the guide loads it shows the loading state", async () => {
  serve();
  server.use(http.get("/api/v1/transport-guide", () => new Promise(() => {})));
  renderApp("/negocio?aba=resumo");
  expect(await screen.findByText("Carregando…")).toBeInTheDocument();
});

test("a failed guide shows an error", async () => {
  serve();
  server.use(
    http.get("/api/v1/transport-guide", () => HttpResponse.json({ detail: "x" }, { status: 500 })),
  );
  renderApp("/negocio?aba=resumo");
  expect(await screen.findByText("Não foi possível carregar o guia.")).toBeInTheDocument();
});
