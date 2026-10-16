import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { AgendaEntryOut } from "../../api/client";
import { IDS, makeAgendaEntry, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

function serveAgenda(entries: AgendaEntryOut[]) {
  const ranges: string[] = [];
  server.use(
    http.get("/api/v1/agenda", ({ request }) => {
      const url = new URL(request.url);
      ranges.push(`${url.searchParams.get("from")}..${url.searchParams.get("to")}`);
      return HttpResponse.json(entries);
    }),
  );
  return ranges;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

test("the list shows the next 30 days grouped by day", async () => {
  const ranges = serveAgenda([
    makeAgendaEntry({ date: "2026-10-15" }),
    makeAgendaEntry({
      date: "2026-10-16",
      kind: "prewedding",
      start_time: null,
      venue_name: "Parque Barigui",
    }),
    makeAgendaEntry({ date: "2026-10-24", contract_id: "other" }),
  ]);
  renderApp("/agenda");

  expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeInTheDocument();
  const tomorrow = await screen.findByRole("region", { name: "Amanhã" });
  expect(screen.getByRole("heading", { level: 2, name: "Hoje" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "sáb., 24/10/2026" })).toBeInTheDocument();
  expect(
    within(tomorrow).getByRole("link", {
      name: "João & Ana, Pré-wedding, sem horário, Parque Barigui",
    }),
  ).toHaveAttribute("href", `/contratos/${IDS.contract}`);
  expect(ranges).toEqual(["2026-10-15..2026-11-14"]);
  expect(screen.getByRole("button", { name: "Próximos 30 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("late in the evening, today is still the local date", async () => {
  vi.setSystemTime(new Date(2026, 9, 15, 23, 30));
  const ranges = serveAgenda([]);
  renderApp("/agenda");
  await screen.findByText("Nenhum ensaio ou casamento nos próximos 30 dias.");
  expect(ranges).toEqual(["2026-10-15..2026-11-14"]);
});

test("90 days asks for a longer range and is remembered", async () => {
  const ranges = serveAgenda([]);
  const { user, unmount } = renderApp("/agenda");
  await user.click(screen.getByRole("button", { name: "Próximos 90 dias" }));
  await screen.findByText("Nenhum ensaio ou casamento nos próximos 90 dias.");
  expect(ranges).toContain("2026-10-15..2027-01-13");
  unmount();

  renderApp("/agenda");
  expect(screen.getByRole("button", { name: "Próximos 90 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a failed load offers a retry", async () => {
  let calls = 0;
  server.use(
    http.get("/api/v1/agenda", () => {
      calls += 1;
      return calls === 1 ? problem(500, "boom") : HttpResponse.json([makeAgendaEntry()]);
    }),
  );
  const { user } = renderApp("/agenda");
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Não foi possível carregar a agenda.");
  await user.click(within(alert).getByRole("button", { name: "Tentar de novo" }));
  expect(
    await screen.findByRole("heading", { level: 2, name: "sáb., 24/10/2026" }),
  ).toBeInTheDocument();
});

test("the page works when storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const ranges = serveAgenda([]);
  const { user } = renderApp("/agenda");
  await user.click(screen.getByRole("button", { name: "Próximos 90 dias" }));
  await waitFor(() => expect(ranges).toContain("2026-10-15..2027-01-13"));
});
