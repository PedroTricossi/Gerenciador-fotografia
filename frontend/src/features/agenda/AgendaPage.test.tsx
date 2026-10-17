import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { AgendaEntryOut } from "../../api/client";
import { IDS, makeAgendaEntry, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";
import { entryLabel } from "./entries";

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

test("coming back to the tab after midnight moves the list to the new today", async () => {
  const ranges = serveAgenda([]);
  renderApp("/agenda");
  await screen.findByText("Nenhum ensaio ou casamento nos próximos 30 dias.");
  expect(ranges).toEqual(["2026-10-15..2026-11-14"]);

  vi.setSystemTime(new Date(2026, 9, 16, 10, 0));
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitFor(() => expect(ranges).toContain("2026-10-16..2026-11-15"));
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
  expect(screen.getByRole("button", { name: "Próximos 30 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Próximos 90 dias" }));
  await waitFor(() => expect(ranges).toContain("2026-10-15..2027-01-13"));
});

function cell(name: string): HTMLElement {
  const td = screen.getByRole("button", { name }).closest("td");
  if (!td) throw new Error(`no cell for ${name}`);
  return td;
}

test("the calendar shows the month's whole weeks and moves between months", async () => {
  const ranges = serveAgenda([makeAgendaEntry()]);
  const { user } = renderApp("/agenda");
  await user.click(screen.getByRole("button", { name: "Calendário" }));

  expect(await screen.findByRole("table", { name: "outubro de 2026" })).toBeInTheDocument();
  await waitFor(() => expect(ranges).toContain("2026-09-27..2026-10-31"));
  expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
    "Dom",
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sáb",
  ]);
  expect(cell("15 de outubro de 2026")).toHaveAttribute("aria-current", "date");
  expect(
    await within(cell("24 de outubro de 2026")).findByRole("link", {
      name: "João & Ana, Casamento, às 16:00, Igreja Matriz",
    }),
  ).toHaveAttribute("href", `/contratos/${IDS.contract}`);

  await user.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(screen.getByRole("table", { name: "novembro de 2026" })).toBeInTheDocument();
  await waitFor(() => expect(ranges).toContain("2026-11-01..2026-12-05"));

  await user.click(screen.getByRole("button", { name: "Hoje" }));
  expect(screen.getByRole("table", { name: "outubro de 2026" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Mês anterior" }));
  expect(screen.getByRole("table", { name: "setembro de 2026" })).toBeInTheDocument();
  await waitFor(() => expect(ranges).toContain("2026-08-30..2026-10-03"));
});

test("a busy day shows three chips and +1 mais, and lists them all when opened", async () => {
  const day = "2026-10-20";
  serveAgenda(
    ["c1", "c2", "c3", "c4"].map((contract_id) => makeAgendaEntry({ date: day, contract_id })),
  );
  localStorage.setItem("gerenciador.agenda.view", "calendar");
  const { user } = renderApp("/agenda");

  const busy = await screen.findByRole("button", { name: "+1 mais" });
  expect(within(cell("20 de outubro de 2026")).getAllByRole("link")).toHaveLength(3);
  await user.click(busy);
  const opened = screen.getByRole("region", { name: "ter., 20/10/2026" });
  expect(within(opened).getAllByRole("link")).toHaveLength(4);
});

test("clicking a day lists its entries below the grid", async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  serveAgenda([makeAgendaEntry({ kind: "prewedding", start_time: null })]);
  localStorage.setItem("gerenciador.agenda.view", "calendar");
  const { user } = renderApp("/agenda");

  await within(cell("24 de outubro de 2026")).findByRole("link");
  expect(within(cell("24 de outubro de 2026")).getByRole("link")).toHaveTextContent(
    "Pré · João & Ana",
  );
  await user.click(screen.getByRole("button", { name: "24 de outubro de 2026" }));
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  expect(
    within(screen.getByRole("region", { name: "sáb., 24/10/2026" })).getByRole("link", {
      name: "João & Ana, Pré-wedding, sem horário, Igreja Matriz",
    }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Lista" }));
  expect(localStorage.getItem("gerenciador.agenda.view")).toBe("list");
  expect(await screen.findByRole("region", { name: "sáb., 24/10/2026" })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("moving to another month or back to today closes the opened day", async () => {
  serveAgenda([makeAgendaEntry()]);
  localStorage.setItem("gerenciador.agenda.view", "calendar");
  const { user } = renderApp("/agenda");

  await within(cell("24 de outubro de 2026")).findByRole("link");
  await user.click(screen.getByRole("button", { name: "24 de outubro de 2026" }));
  expect(screen.getByRole("region", { name: "sáb., 24/10/2026" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(screen.queryByRole("region", { name: "sáb., 24/10/2026" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Hoje" }));
  await within(cell("24 de outubro de 2026")).findByRole("link");
  await user.click(screen.getByRole("button", { name: "24 de outubro de 2026" }));
  expect(screen.getByRole("region", { name: "sáb., 24/10/2026" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Hoje" }));
  expect(screen.queryByRole("region", { name: "sáb., 24/10/2026" })).not.toBeInTheDocument();
});

test("a long couple name keeps its full label as the chip's name", async () => {
  const groom = { full_name: "Bartolomeumaximilianodealbuquerqueevasconcelos Neto" };
  const bride = { full_name: "Anastaciagenovevacristinademontenegroefigueiredo Lima" };
  const entry = makeAgendaEntry({ groom, bride, venue_name: "Igreja Matriz" });
  serveAgenda([entry]);
  localStorage.setItem("gerenciador.agenda.view", "calendar");
  renderApp("/agenda");

  const chip = await within(cell("24 de outubro de 2026")).findByRole("link");
  const label = entryLabel(entry);
  expect(label.length).toBeGreaterThan(80);
  expect(chip).toHaveAccessibleName(label);
  expect(chip).toHaveAttribute("title", label);
});
