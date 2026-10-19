import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { makeExpenseEntry, problem } from "../../../test/fixtures";
import { renderApp } from "../../../test/render";
import { server } from "../../../test/server";

const CAFE = "6f1c0a52-9999-4000-8000-000000000009";
const TRANSPORT = "6f1c0a52-9999-4000-8000-00000000000a";
const C_WEDDING = "6f1c0a52-1111-4000-8000-000000000001";
const C_PRE = "6f1c0a52-1111-4000-8000-000000000002";
const C_LATE = "6f1c0a52-1111-4000-8000-000000000003";
const C_NOPRE = "6f1c0a52-1111-4000-8000-000000000004";
const EXPENSE_ID = "6f1c0a52-8888-4000-8000-000000000008";

const TYPES = [
  { id: CAFE, name: "Café", key: null, archived_at: null, version: 1 },
  { id: TRANSPORT, name: "Transporte", key: "transport", archived_at: null, version: 1 },
];
const EVENTS = [
  {
    contract_id: C_LATE,
    event_kind: "wedding",
    date: "2026-12-05",
    groom_name: "Lia Sá",
    bride_name: "Davi Paz",
    venue_name: "Sítio Sol",
    venue_address: null,
  },
  {
    contract_id: C_WEDDING,
    event_kind: "wedding",
    date: "2026-10-11",
    groom_name: "Caio Reis",
    bride_name: "Duda Melo",
    venue_name: "Igreja Matriz",
    venue_address: "Rua das Flores, 10",
  },
  {
    contract_id: C_PRE,
    event_kind: "prewedding",
    date: "2026-10-19",
    groom_name: "Ana Luz",
    bride_name: "Bia Lins",
    venue_name: "Parque",
    venue_address: "Av. Central, 1",
  },
  {
    contract_id: C_NOPRE,
    event_kind: "wedding",
    date: "2026-11-01",
    groom_name: "Rui Gil",
    bride_name: "Eva Dias",
    venue_name: "Salão",
    venue_address: null,
  },
];

const CAFE_ENTRY = makeExpenseEntry({
  id: "manual:cafe",
  date: "2026-10-14",
  amount_cents: 3800,
  type_id: CAFE,
  description: "Café (edição)",
  expense_id: EXPENSE_ID,
  version: 3,
});

function serve(entries = [CAFE_ENTRY], stored: unknown = null) {
  server.use(
    http.get("/api/v1/expense-entries", () => HttpResponse.json({ entries, total_cents: 0 })),
    http.get("/api/v1/fixed-costs", () => HttpResponse.json([])),
    http.get("/api/v1/second-photographer-fee", () => HttpResponse.json({ prices: [] })),
    http.get("/api/v1/expense-types", () => HttpResponse.json(TYPES)),
    http.get("/api/v1/expense-events", () => HttpResponse.json(EVENTS)),
    ...(stored
      ? [http.get(`/api/v1/expenses/${EXPENSE_ID}`, () => HttpResponse.json(stored))]
      : []),
  );
}

const STORED_CAFE = {
  id: EXPENSE_ID,
  spent_on: "2026-10-14",
  amount_cents: 3800,
  type_id: CAFE,
  description: "Café (edição)",
  trip: null,
  version: 3,
  created_at: "2026-10-14T10:00:00Z",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

// user-event matches option text on innerHTML, where "&" is "&amp;", so pass the element.
async function pickEvent(user: UserEvent, dialog: HTMLElement, name: string) {
  const select = within(dialog).getByLabelText("Casamento ou pré-wedding");
  await user.selectOptions(select, within(select).getByRole("option", { name }));
}

async function openNew() {
  const view = renderApp("/negocio?aba=despesas");
  await view.user.click(await screen.findByRole("button", { name: "+ Nova despesa" }));
  const dialog = await screen.findByRole("dialog", { name: "Nova despesa" });
  await within(dialog).findByRole("option", { name: "Transporte" });
  return { ...view, dialog };
}

test("choosing Transporte shows the trip group and Café hides it", async () => {
  serve();
  const { user, dialog } = await openNew();
  expect(within(dialog).getByLabelText("Data")).toHaveValue("2026-10-20");
  expect(within(dialog).getByText("Não escreva CPF ou endereço aqui.")).toBeInTheDocument();
  expect(within(dialog).queryByText("Só para transporte")).toBeNull();
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Transporte");
  expect(within(dialog).getByText("Só para transporte")).toBeInTheDocument();
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Café");
  expect(within(dialog).queryByText("Só para transporte")).toBeNull();
});

test("event options are ordered by closeness to the date and show the venue line", async () => {
  serve();
  const { user, dialog } = await openNew();
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Transporte");
  const select = within(dialog).getByLabelText("Casamento ou pré-wedding");
  expect(
    within(select)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual([
    "Nenhum",
    "Ana & Bia · pré-wedding 19/10",
    "Caio & Duda · casamento 11/10",
    "Rui & Eva · casamento 01/11",
    "Lia & Davi · casamento 05/12",
  ]);

  fireEvent.change(within(dialog).getByLabelText("Data"), { target: { value: "2026-12-01" } });
  expect(within(select).getAllByRole("option")[1]).toHaveTextContent("Lia & Davi");

  await pickEvent(user, dialog, "Lia & Davi · casamento 05/12");
  expect(
    within(dialog).getByText("Endereço do local: Sítio Sol (do contrato)"),
  ).toBeInTheDocument();
  await pickEvent(user, dialog, "Caio & Duda · casamento 11/10");
  expect(
    within(dialog).getByText("Endereço do local: Igreja Matriz, Rua das Flores, 10 (do contrato)"),
  ).toBeInTheDocument();
});

test("an event without a distance is a required-field error and sends nothing", async () => {
  serve();
  let posted = false;
  server.use(
    http.post("/api/v1/expenses", () => {
      posted = true;
      return HttpResponse.json(STORED_CAFE, { status: 201 });
    }),
  );
  const { user, dialog } = await openNew();
  await user.type(within(dialog).getByLabelText("Valor"), "86");
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Transporte");
  await pickEvent(user, dialog, "Caio & Duda · casamento 11/10");
  await user.selectOptions(within(dialog).getByLabelText("Meio de transporte"), "Carro");
  await user.type(within(dialog).getByLabelText("Saí de casa às"), "13:30");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  const field = within(dialog).getByLabelText("Distância (km)");
  expect(field).toHaveAccessibleDescription("campo obrigatório");
  expect(posted).toBe(false);
});

test("creates an expense with its trip and closes", async () => {
  serve();
  let sent: unknown;
  server.use(
    http.post("/api/v1/expenses", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json(STORED_CAFE, { status: 201 });
    }),
  );
  const { user, dialog } = await openNew();
  await user.type(within(dialog).getByLabelText("Valor"), "86,00");
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Transporte");
  await pickEvent(user, dialog, "Caio & Duda · casamento 11/10");
  await user.selectOptions(within(dialog).getByLabelText("Meio de transporte"), "App (Uber/99)");
  await user.type(within(dialog).getByLabelText("Saí de casa às"), "13:30");
  await user.type(within(dialog).getByLabelText("Distância (km)"), "32");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(sent).toEqual({
    spent_on: "2026-10-20",
    amount_cents: 8600,
    type_id: TRANSPORT,
    description: null,
    trip: {
      contract_id: C_WEDDING,
      event_kind: "wedding",
      transport_kind: "ride_app",
      left_home_at: "13:30",
      distance_tenths: 320,
    },
  });
});

test("a double click on Salvar sends one request", async () => {
  serve();
  let count = 0;
  server.use(
    http.post("/api/v1/expenses", async () => {
      count += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return HttpResponse.json(STORED_CAFE, { status: 201 });
    }),
  );
  const { user, dialog } = await openNew();
  await user.type(within(dialog).getByLabelText("Valor"), "10");
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Café");
  const save = within(dialog).getByRole("button", { name: "Salvar" });
  await user.dblClick(save);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(count).toBe(1);
});

test("Editar opens filled from the stored expense and PATCHes with If-Match", async () => {
  serve([CAFE_ENTRY], STORED_CAFE);
  let sent: unknown;
  let ifMatch: string | null = null;
  server.use(
    http.patch(`/api/v1/expenses/${EXPENSE_ID}`, async ({ request }) => {
      sent = await request.json();
      ifMatch = request.headers.get("if-match");
      return HttpResponse.json({ ...STORED_CAFE, version: 4 });
    }),
  );
  const { user } = renderApp("/negocio?aba=despesas");
  await user.click(await screen.findByRole("button", { name: /^Editar/ }));
  const dialog = await screen.findByRole("dialog", { name: "Editar despesa" });
  await waitFor(() => expect(within(dialog).getByLabelText("Valor")).toHaveValue("38,00"));
  expect(within(dialog).getByLabelText("Data")).toHaveValue("2026-10-14");
  expect(within(dialog).getByLabelText("Tipo")).toHaveValue(CAFE);
  expect(within(dialog).getByLabelText("Descrição (opcional)")).toHaveValue("Café (edição)");
  await user.clear(within(dialog).getByLabelText("Valor"));
  await user.type(within(dialog).getByLabelText("Valor"), "40");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(ifMatch).toBe('"3"');
  expect(sent).toEqual({
    spent_on: "2026-10-14",
    amount_cents: 4000,
    type_id: CAFE,
    description: "Café (edição)",
    trip: null,
  });
});

const STORED_TRIP = (contract_id: string, event_kind: string) => ({
  ...STORED_CAFE,
  type_id: TRANSPORT,
  description: null,
  trip: {
    contract_id,
    event_kind,
    transport_kind: "car",
    left_home_at: "13:30:00",
    distance_tenths: 325,
  },
});

test("switching a linked transport expense to another type warns that the trip is erased", async () => {
  serve(
    [
      makeExpenseEntry({
        id: "manual:t",
        expense_id: EXPENSE_ID,
        type_id: TRANSPORT,
        type_name: "Transporte",
        type_key: "transport",
        description: "Corrida",
      }),
    ],
    STORED_TRIP(C_WEDDING, "wedding"),
  );
  const { user } = renderApp("/negocio?aba=despesas");
  await user.click(await screen.findByRole("button", { name: /^Editar/ }));
  const dialog = await screen.findByRole("dialog", { name: "Editar despesa" });
  await waitFor(() => expect(within(dialog).getByLabelText("Distância (km)")).toHaveValue("32,5"));
  expect(within(dialog).queryByText("Os dados da viagem serão apagados ao salvar.")).toBeNull();
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Café");
  expect(
    within(dialog).getByText("Os dados da viagem serão apagados ao salvar."),
  ).toBeInTheDocument();
});

test.each([
  ["a deleted contract", "11111111-0000-4000-8000-0000000000aa", "wedding", "(contrato excluído)"],
  ["a cancelled pre-wedding", C_NOPRE, "prewedding", "(pré-wedding cancelado)"],
])(
  "a dangling link to %s stays selected and is sent back unchanged",
  async (_name, contract, kind, label) => {
    serve(
      [
        makeExpenseEntry({
          id: "manual:t",
          expense_id: EXPENSE_ID,
          type_id: TRANSPORT,
          type_name: "Transporte",
          type_key: "transport",
        }),
      ],
      STORED_TRIP(contract, kind),
    );
    let sent: { trip: unknown } | undefined;
    server.use(
      http.patch(`/api/v1/expenses/${EXPENSE_ID}`, async ({ request }) => {
        sent = (await request.json()) as { trip: unknown };
        return HttpResponse.json(STORED_CAFE);
      }),
    );
    const { user } = renderApp("/negocio?aba=despesas");
    await user.click(await screen.findByRole("button", { name: /^Editar/ }));
    const dialog = await screen.findByRole("dialog", { name: "Editar despesa" });
    const select = await within(dialog).findByLabelText("Casamento ou pré-wedding");
    await waitFor(() => expect(select).toHaveDisplayValue(label));
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sent?.trip).toEqual({
      contract_id: contract,
      event_kind: kind,
      transport_kind: "car",
      left_home_at: "13:30",
      distance_tenths: 325,
    });
  },
);

test("Excluir asks to confirm, then sends DELETE with If-Match", async () => {
  serve([CAFE_ENTRY], STORED_CAFE);
  let ifMatch: string | null = null;
  server.use(
    http.delete(`/api/v1/expenses/${EXPENSE_ID}`, ({ request }) => {
      ifMatch = request.headers.get("if-match");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user } = renderApp("/negocio?aba=despesas");
  await user.click(await screen.findByRole("button", { name: /^Editar/ }));
  const dialog = await screen.findByRole("dialog", { name: "Editar despesa" });
  await user.click(await within(dialog).findByRole("button", { name: "Excluir" }));
  const confirm = await screen.findByRole("dialog", { name: "Excluir esta despesa?" });
  await user.click(within(confirm).getByRole("button", { name: "Excluir" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(ifMatch).toBe('"3"');
});

test("a new expense has no Excluir button", async () => {
  serve();
  const { dialog } = await openNew();
  expect(within(dialog).queryByRole("button", { name: "Excluir" })).toBeNull();
});

test("a 422 on trip.contract_id shows its message on the event field", async () => {
  serve();
  server.use(
    http.post("/api/v1/expenses", () =>
      problem(422, "invalid", {
        errors: [{ field: "trip.contract_id", message: "evento não encontrado" }],
      }),
    ),
  );
  const { user, dialog } = await openNew();
  await user.type(within(dialog).getByLabelText("Valor"), "86");
  await user.selectOptions(within(dialog).getByLabelText("Tipo"), "Transporte");
  await pickEvent(user, dialog, "Caio & Duda · casamento 11/10");
  await user.selectOptions(within(dialog).getByLabelText("Meio de transporte"), "Carro");
  await user.type(within(dialog).getByLabelText("Saí de casa às"), "13:30");
  await user.type(within(dialog).getByLabelText("Distância (km)"), "32");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await within(dialog).findByText("evento não encontrado")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Casamento ou pré-wedding")).toHaveAccessibleDescription(
    "evento não encontrado",
  );
});
