import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ContractOut, PreweddingOut } from "../../api/client";
import { IDS, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const SCHEDULED: PreweddingOut = {
  date: "2027-01-20",
  venue_name: "Parque Barigui",
  venue_address: null,
  start_time: "16:00:00",
  version: 3,
};

function eligible(prewedding: PreweddingOut | null = null): ContractOut {
  return makeContract({ has_prewedding: true, prewedding });
}

let call = 0;
const calls = () => call;

function serveList(...responses: ContractOut[][]) {
  call = 0;
  server.use(
    http.get("/api/v1/contracts", () => {
      const rows = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      return HttpResponse.json(page(rows));
    }),
  );
}

function setInput(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

async function openDialog(name: string) {
  const { user } = renderApp("/contratos");
  await user.click(await screen.findByRole("button", { name }));
  return { user, dialog: screen.getByRole("dialog", { name: "Pré-wedding" }) };
}

test("the button shows only where a pre-wedding is possible or stored", async () => {
  serveList([
    makeContract({ id: "plain" }),
    makeContract({ id: "eligible", has_prewedding: true }),
    makeContract({ id: "scheduled", has_prewedding: true, prewedding: SCHEDULED }),
    // A service un-marked after scheduling: the schedule can still be cancelled.
    makeContract({ id: "orphan", has_prewedding: false, prewedding: SCHEDULED }),
  ]);
  renderApp("/contratos");
  const rows = await screen.findAllByRole("row");
  const labels = rows
    .slice(1)
    .map((row) => within(row).queryByRole("button", { name: /pré-wedding/i })?.textContent ?? null);
  expect(labels).toEqual([null, "Agendar pré-wedding", "Pré-wedding 20/01", "Pré-wedding 20/01"]);
});

test("schedules without If-Match", async () => {
  serveList([eligible()]);
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("If-Match") };
      return HttpResponse.json({ ...SCHEDULED, version: 1 }, { status: 201 });
    }),
  );
  const { user, dialog } = await openDialog("Agendar pré-wedding");
  setInput(within(dialog).getByLabelText("Data"), "2027-01-20");
  await user.type(within(dialog).getByLabelText("Local"), "Parque Barigui");
  setInput(within(dialog).getByLabelText("Horário"), "16:00");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

  expect(await screen.findByText("Pré-wedding agendado")).toBeInTheDocument();
  expect(sent).toEqual({
    body: {
      date: "2027-01-20",
      venue_name: "Parque Barigui",
      venue_address: null,
      start_time: "16:00",
    },
    ifMatch: null,
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a change is prefilled and sends If-Match", async () => {
  serveList([eligible(SCHEDULED)]);
  let ifMatch: string | null = null;
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return HttpResponse.json({ ...SCHEDULED, venue_name: "Jardim", version: 4 });
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  const place = within(dialog).getByLabelText("Local");
  expect(place).toHaveValue("Parque Barigui");
  expect(within(dialog).getByLabelText("Horário")).toHaveValue("16:00");
  await user.clear(place);
  await user.type(place, "Jardim");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Pré-wedding atualizado")).toBeInTheDocument();
  expect(ifMatch).toBe('"3"');
});

test("validates before sending", async () => {
  serveList([eligible()]);
  const { user, dialog } = await openDialog("Agendar pré-wedding");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getAllByText("campo obrigatório")).toHaveLength(2);
});

test("a stale version reloads the dialog and the retry sends the new version", async () => {
  const moved = { ...SCHEDULED, venue_name: "Jardim Botânico", version: 4 };
  serveList([eligible(SCHEDULED)], [eligible(moved)]);
  const sent: (string | null)[] = [];
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", ({ request }) => {
      sent.push(request.headers.get("If-Match"));
      return sent.length === 1
        ? problem(412, "The prewedding changed since it was loaded")
        : HttpResponse.json({ ...moved, version: 5 });
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

  expect(
    await within(dialog).findByText(
      "O pré-wedding mudou desde que foi aberto. Os dados foram recarregados.",
    ),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(within(dialog).getByLabelText("Local")).toHaveValue("Jardim Botânico"),
  );
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("Pré-wedding atualizado")).toBeInTheDocument();
  expect(sent).toEqual(['"3"', '"4"']);
});

test("typing after a stale answer that reloaded nothing keeps the typed value", async () => {
  const moved = { ...SCHEDULED, venue_name: "Jardim Botânico", version: 4 };
  // The refetch after the 412 returns the same version; a later one returns a newer version.
  serveList([eligible(SCHEDULED)], [eligible(SCHEDULED)], [eligible(moved)]);
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", () =>
      problem(412, "The prewedding changed since it was loaded"),
    ),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  await within(dialog).findByText(
    "O pré-wedding mudou desde que foi aberto. Os dados foram recarregados.",
  );
  setInput(within(dialog).getByLabelText("Local"), "Meu local");

  // A later background refetch (reconnecting) brings a newer version.
  act(() => onlineManager.setOnline(false));
  act(() => onlineManager.setOnline(true));
  await waitFor(() => expect(calls()).toBe(3));
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(within(dialog).getByLabelText("Local")).toHaveValue("Meu local");
});

test("a refusal shows the server's message", async () => {
  serveList([eligible()]);
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", () =>
      problem(409, "este contrato não inclui pré-wedding"),
    ),
  );
  const { user, dialog } = await openDialog("Agendar pré-wedding");
  setInput(within(dialog).getByLabelText("Data"), "2027-01-20");
  await user.type(within(dialog).getByLabelText("Local"), "Parque");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(
    await within(dialog).findByText("este contrato não inclui pré-wedding"),
  ).toBeInTheDocument();
});

test("unschedules after a confirmation", async () => {
  serveList([eligible(SCHEDULED)]);
  let ifMatch: string | null = null;
  server.use(
    http.delete(`/api/v1/contracts/${IDS.contract}/prewedding`, ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Desmarcar pré-wedding" }));
  expect(within(dialog).getByText("Desmarcar o pré-wedding de 20/01/2027?")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
  await user.click(within(dialog).getByRole("button", { name: "Desmarcar pré-wedding" }));
  await user.click(within(dialog).getByRole("button", { name: "Desmarcar" }));
  expect(await screen.findByText("Pré-wedding desmarcado")).toBeInTheDocument();
  expect(ifMatch).toBe('"3"');
});

test("closing is blocked while a save is pending", async () => {
  serveList([eligible(SCHEDULED)]);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.put("/api/v1/contracts/:id/prewedding", async () => {
      await gate;
      return HttpResponse.json(SCHEDULED);
    }),
  );
  const { user, dialog } = await openDialog("Pré-wedding 20/01");
  await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
  expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Pré-wedding" })).toBeInTheDocument();
  release();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
