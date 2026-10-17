import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import type { InstalmentItem } from "./groups";

function item(overrides: Partial<InstalmentItem>): InstalmentItem {
  return {
    contract_id: IDS.contract,
    groom_name: "Bruno Costa",
    bride_name: "Ana Lima",
    number: 1,
    count: 3,
    month: "2026-12",
    amount_cents: 50000,
    paid_on: null,
    plan_needs_review: false,
    ...overrides,
  };
}

const LATE = item({ number: 1, month: "2026-11", amount_cents: 11100 });
const OPEN = item({ number: 2, month: "2026-12", amount_cents: 22200 });
const PAID = item({
  contract_id: "other",
  groom_name: "Caio Reis",
  bride_name: "Duda Melo",
  number: 1,
  month: "2026-12",
  amount_cents: 33300,
  paid_on: "2026-12-03",
});
const NEXT = item({ number: 3, month: "2027-01", amount_cents: 44400 });

function listing(items: InstalmentItem[]) {
  return http.get("/api/v1/instalments", () => HttpResponse.json(items));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 11, 15, 10) });
});
afterEach(() => vi.useRealTimers());

test("shows late, this month and upcoming groups with the right rows", async () => {
  server.use(listing([LATE, OPEN, PAID, NEXT]));
  renderApp("/negocio");
  expect(await screen.findByRole("heading", { level: 1, name: "Negócio" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Parcelas" })).toBeInTheDocument();

  const late = await screen.findByRole("list", { name: "Atrasadas" });
  const lateRow = within(late).getByRole("listitem");
  expect(lateRow).toHaveTextContent("Bruno & Ana");
  expect(lateRow).toHaveTextContent("1/3");
  expect(lateRow).toHaveTextContent("Novembro");
  expect(lateRow).toHaveTextContent("R$ 111,00");
  expect(lateRow).toHaveTextContent("Atrasada");
  expect(within(lateRow).getByRole("link", { name: /Bruno & Ana/ })).toHaveAttribute(
    "href",
    `/contratos/${IDS.contract}`,
  );

  const month = screen.getByRole("list", { name: "Dezembro" });
  expect(within(month).getAllByRole("listitem")).toHaveLength(2);
  expect(within(month).getByText(/✓ paga em 03\/12/)).toBeInTheDocument();
  expect(within(month).getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
  expect(within(month).getByRole("button", { name: "Marcar como paga" })).toBeInTheDocument();

  const upcoming = screen.getByRole("list", { name: "Janeiro" });
  expect(within(upcoming).getByRole("listitem")).toHaveTextContent("R$ 444,00");
  expect(screen.getByRole("heading", { level: 3, name: "Próximos meses" })).toBeInTheDocument();
});

test("an empty list says so", async () => {
  server.use(listing([]));
  renderApp("/negocio");
  expect(await screen.findByText("Nenhuma parcela por aqui.")).toBeInTheDocument();
});

test("Marcar como paga posts today's date and the row shows it paid", async () => {
  let paid: string | null = null;
  const posted = vi.fn();
  server.use(
    http.get("/api/v1/instalments", () =>
      HttpResponse.json([paid ? { ...OPEN, paid_on: paid } : OPEN]),
    ),
    http.post("/api/v1/contracts/:id/instalments/:number/paid", async ({ request, params }) => {
      const body = (await request.json()) as { paid_on: string };
      posted(params.id, params.number, body);
      paid = body.paid_on;
      return HttpResponse.json({ ...OPEN, paid_on: paid });
    }),
  );
  const { user } = renderApp("/negocio");
  await user.click(await screen.findByRole("button", { name: "Marcar como paga" }));
  expect(await screen.findByText(/✓ paga em 15\/12/)).toBeInTheDocument();
  expect(posted).toHaveBeenCalledExactlyOnceWith(IDS.contract, "2", { paid_on: "2026-12-15" });
});

test("Desfazer sends the DELETE", async () => {
  let paidOn: string | null = PAID.paid_on;
  const deleted = vi.fn();
  server.use(
    http.get("/api/v1/instalments", () => HttpResponse.json([{ ...PAID, paid_on: paidOn }])),
    http.delete("/api/v1/contracts/:id/instalments/:number/paid", ({ params }) => {
      deleted(params.id, params.number);
      paidOn = null;
      return HttpResponse.json({ ...PAID, paid_on: null });
    }),
  );
  const { user } = renderApp("/negocio");
  await user.click(await screen.findByRole("button", { name: "Desfazer" }));
  expect(await screen.findByRole("button", { name: "Marcar como paga" })).toBeInTheDocument();
  expect(deleted).toHaveBeenCalledExactlyOnceWith("other", "1");
});

test("a 409 shows a calm message and refetches", async () => {
  let listed = 0;
  server.use(
    http.get("/api/v1/instalments", () => {
      listed += 1;
      return HttpResponse.json([listed > 1 ? { ...OPEN, paid_on: "2026-12-14" } : OPEN]);
    }),
    http.post("/api/v1/contracts/:id/instalments/:number/paid", () =>
      problem(409, "Instalment already paid"),
    ),
  );
  const { user } = renderApp("/negocio");
  await user.click(await screen.findByRole("button", { name: "Marcar como paga" }));
  expect(await screen.findByText("Esta parcela já estava atualizada.")).toBeInTheDocument();
  expect(await screen.findByText(/✓ paga em 14\/12/)).toBeInTheDocument();
  expect(listed).toBe(2);
});

test("a double click sends one POST", async () => {
  const posted = vi.fn();
  server.use(
    listing([OPEN]),
    http.post("/api/v1/contracts/:id/instalments/:number/paid", async () => {
      posted();
      await new Promise((resolve) => setTimeout(resolve, 30));
      return HttpResponse.json({ ...OPEN, paid_on: "2026-12-15" });
    }),
  );
  const { user } = renderApp("/negocio");
  await user.dblClick(await screen.findByRole("button", { name: "Marcar como paga" }));
  await waitFor(() => expect(posted).toHaveBeenCalled());
  expect(posted).toHaveBeenCalledTimes(1);
});

test("rows of contracts to review carry the Revisar plano badge", async () => {
  server.use(listing([{ ...OPEN, plan_needs_review: true }, PAID]));
  renderApp("/negocio");
  await screen.findByText("Revisar plano");
  const rows = within(screen.getByRole("main")).getAllByRole("listitem");
  expect(within(rows[0]!).getByText("Revisar plano")).toBeInTheDocument();
  expect(within(rows[1]!).queryByText("Revisar plano")).not.toBeInTheDocument();
});

test("the nav has a Negócio link after Serviços that opens /negocio", async () => {
  server.use(listing([]));
  const { user, router } = renderApp("/contratos");
  const nav = screen.getByRole("navigation", { name: "Principal" });
  const links = within(nav).getAllByRole("link");
  expect(links.map((link) => link.textContent).slice(-2)).toEqual(["Serviços", "Negócio"]);
  await user.click(within(nav).getByRole("link", { name: "Negócio" }));
  expect(router.state.location.pathname).toBe("/negocio");
  expect(await screen.findByRole("heading", { level: 1, name: "Negócio" })).toBeInTheDocument();
});
