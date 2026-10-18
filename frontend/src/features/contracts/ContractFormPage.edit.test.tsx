import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { currentMonth } from "../../domain/instalments";
import { IDS, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const URL_PATH = `/contratos/${IDS.contract}`;
const EVENT_REQUEST = {
  date: "2027-03-14",
  venue_name: "Capela",
  venue_address: null,
  coverage_start: "16:00",
  coverage_end: null,
  hours_contracted: null,
};

function serveContract(contract = makeContract()) {
  server.use(http.get("/api/v1/contracts/:id", () => HttpResponse.json(contract)));
}

test("loads the contract into the form with nothing to save yet", async () => {
  serveContract();
  renderApp(URL_PATH);
  expect(await screen.findByRole("heading", { level: 1, name: "Bruno & Ana" })).toBeInTheDocument();
  expect(screen.getByLabelText("Nome do noivo")).toHaveValue("Bruno Costa");
  expect(screen.getByLabelText("CPF da noiva")).toHaveValue("987.654.321-00");
  expect(await screen.findByLabelText("Valor do item 1")).toHaveValue("1.200,00");
  expect(screen.getByLabelText("Desconto PIX")).toHaveValue("300,00");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("saving sends only the changed section with If-Match", async () => {
  serveContract();
  let sent: { body: unknown; ifMatch: string | null } | undefined;
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      sent = { body: await request.json(), ifMatch: request.headers.get("If-Match") };
      return HttpResponse.json(
        makeContract({ version: 2, event: { ...makeContract().event, venue_name: "Capela" } }),
      );
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Capela");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent).toEqual({ body: { event: EVENT_REQUEST }, ifMatch: '"1"' });
  expect(screen.getByLabelText("Local do evento")).toHaveValue("Capela");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("a double click on Salvar sends one PATCH", async () => {
  serveContract();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const patched = vi.fn();
  server.use(
    http.patch("/api/v1/contracts/:id", async () => {
      patched();
      await gate;
      return HttpResponse.json(makeContract({ version: 2 }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Capela");
  await user.dblClick(screen.getByRole("button", { name: "Salvar" }));
  release();
  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(patched).toHaveBeenCalledOnce();
});

test("retyping the same amount differently is not a change", async () => {
  serveContract();
  const { user } = renderApp(URL_PATH);
  const amount = await screen.findByLabelText("Valor do item 1");
  await user.clear(amount);
  await user.type(amount, "1200");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

test("a changed item list is sent whole", async () => {
  serveContract();
  let body: unknown;
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeContract({ version: 2 }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  await user.click(await screen.findByRole("button", { name: "Remover item 2" }));
  await user.clear(screen.getByLabelText("Desconto PIX"));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByText("Alterações salvas");
  expect(body).toEqual({
    payment: {
      items: [{ service_id: IDS.serviceCeremony, amount_cents: 120000 }],
      pix_discount_cents: null,
    },
  });
});

test("a stale version offers a reload that discards the edits", async () => {
  let version = 1;
  server.use(
    http.get("/api/v1/contracts/:id", () =>
      HttpResponse.json(
        version === 1
          ? makeContract()
          : makeContract({
              version: 2,
              event: { ...makeContract().event, venue_name: "Capela Nova" },
            }),
      ),
    ),
    http.patch("/api/v1/contracts/:id", () => {
      version = 2;
      return problem(412, "Precondition Failed");
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Minha edição");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  const dialog = await screen.findByRole("dialog", { name: "Contrato alterado" });
  expect(dialog).toHaveTextContent("Este contrato foi alterado em outro lugar.");
  await user.click(screen.getByRole("button", { name: "Recarregar" }));
  await waitFor(() => expect(screen.getByLabelText("Local do evento")).toHaveValue("Capela Nova"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("a deleted contract is read-only until restored", async () => {
  serveContract(makeContract({ deleted_at: "2026-10-14T10:00:00Z" }));
  server.use(http.post("/api/v1/contracts/:id/restore", () => HttpResponse.json(makeContract())));
  const { user } = renderApp(URL_PATH);
  expect(await screen.findByText(/Este contrato foi excluído/)).toBeInTheDocument();
  expect(screen.getByLabelText("Nome do noivo")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Restaurar" }));
  await waitFor(() => expect(screen.getByLabelText("Nome do noivo")).toBeEnabled());
  expect(screen.getByText("Contrato restaurado")).toBeInTheDocument();
});

test("a missing contract says so", async () => {
  server.use(http.get("/api/v1/contracts/:id", () => problem(404, "contract not found")));
  renderApp(URL_PATH);
  expect(
    await screen.findByRole("heading", { level: 1, name: "Contrato não encontrado" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para contratos" })).toBeInTheDocument();
});

test("leaving with unsaved changes asks first", async () => {
  serveContract();
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.type(venue, " editado");

  await user.click(screen.getByRole("link", { name: "Clientes" }));
  expect(screen.getByRole("dialog", { name: "Descartar alterações?" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(router.state.location.pathname).toBe(URL_PATH);
  expect(screen.getByLabelText("Local do evento")).toHaveValue("Igreja Matriz editado");

  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/clientes"));
});

test("leaving without changes does not ask", async () => {
  serveContract();
  server.use(http.get("/api/v1/clients", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp(URL_PATH);
  await screen.findByLabelText("Local do evento");
  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/clientes"));
});

test("Baixar PDF waits for unsaved changes to be saved", async () => {
  serveContract();
  const clicked = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  server.use(
    http.get(
      "/api/v1/contracts/:id/pdf",
      () =>
        new HttpResponse(new Blob(["%PDF"]), { headers: { "Content-Type": "application/pdf" } }),
    ),
  );
  const { user } = renderApp(URL_PATH);
  const download = await screen.findByRole("button", { name: "Baixar PDF" });
  expect(download).toBeEnabled();

  await user.type(screen.getByLabelText("Local do evento"), "!");
  expect(download).toBeDisabled();
  expect(screen.getByText("Salve as alterações antes de baixar o PDF.")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Local do evento"), "{Backspace}");
  expect(download).toBeEnabled();
  await user.click(download);
  await waitFor(() => expect(clicked).toHaveBeenCalledOnce());
});

test("Baixar PDF on a contract deleted elsewhere says so", async () => {
  serveContract();
  server.use(http.get("/api/v1/contracts/:id/pdf", () => problem(409, "contract is deleted")));
  const { user } = renderApp(URL_PATH);
  await user.click(await screen.findByRole("button", { name: "Baixar PDF" }));
  expect(
    await screen.findByText("Este contrato foi excluído. Restaure-o para baixar o PDF."),
  ).toBeInTheDocument();
});

test("an old contract keeps its archived service under its own wording", async () => {
  serveContract(
    makeContract({
      payment: {
        items: [
          { service_id: IDS.serviceArchived, description: "Álbum de luxo", amount_cents: 30000 },
        ],
        pix_discount_cents: null,
        total_cents: 30000,
      },
    }),
  );
  renderApp(URL_PATH);
  const select = await screen.findByLabelText("Serviço do item 1");
  expect(select).toHaveDisplayValue("Álbum de luxo (arquivado)");
  expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
});

const PRE_ITEMS = {
  items: [
    {
      service_id: IDS.serviceCeremony,
      description: "Cobertura da cerimônia na igreja",
      amount_cents: 120000,
    },
    {
      service_id: IDS.servicePrewedding,
      description: "Ensaio de pré-wedding",
      amount_cents: 80000,
    },
  ],
  pix_discount_cents: null,
  total_cents: 200000,
};
const SCHEDULED = {
  date: "2027-01-20",
  venue_name: "Parque Barigui",
  venue_address: null,
  start_time: "16:00:00",
  version: 2,
};

test("shows the pre-wedding as a read-only summary", async () => {
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true, prewedding: SCHEDULED }));
  renderApp(URL_PATH);
  expect(
    await screen.findByText("Pré-wedding: 20/01/2027 às 16:00 · Parque Barigui"),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Data do pré-wedding")).toBeNull();
});

test("shows when nothing is scheduled yet", async () => {
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true }));
  renderApp(URL_PATH);
  expect(await screen.findByText("Pré-wedding: não agendado")).toBeInTheDocument();
});

test("a deleted contract shows no pre-wedding section", async () => {
  serveContract(
    makeContract({
      payment: PRE_ITEMS,
      has_prewedding: true,
      deleted_at: "2026-10-14T10:00:00Z",
    }),
  );
  renderApp(URL_PATH);
  expect(await screen.findByText(/Este contrato foi excluído/)).toBeInTheDocument();
  expect(screen.queryByText("Pré-wedding: não agendado")).toBeNull();
  expect(screen.queryByText(/botão de pré-wedding/)).toBeNull();
});

async function removePreweddingItem(user: UserEvent) {
  await user.click(await screen.findByRole("button", { name: "Remover item 2" }));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
}

test("removing the pre-wedding item asks before cancelling the schedule", async () => {
  serveContract(makeContract({ payment: PRE_ITEMS, has_prewedding: true, prewedding: SCHEDULED }));
  const sent: unknown[] = [];
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(makeContract({ version: 2 }));
    }),
  );
  const { user } = renderApp(URL_PATH);
  await removePreweddingItem(user);
  const confirm = screen.getByRole("dialog", { name: "Cancelar pré-wedding?" });
  expect(
    within(confirm).getByText(
      "Este contrato tem um pré-wedding agendado em 20/01/2027. Remover o item cancela esse agendamento.",
    ),
  ).toBeInTheDocument();
  await user.click(within(confirm).getByRole("button", { name: "Voltar" }));
  expect(sent).toEqual([]);

  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await user.click(screen.getByRole("button", { name: "Remover e salvar" }));
  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent).toEqual([
    {
      payment: {
        items: [{ service_id: IDS.serviceCeremony, amount_cents: 120000 }],
        pix_discount_cents: null,
      },
      cancel_prewedding: true,
    },
  ]);
});

test("a schedule made elsewhere is caught by the server and asked the same way", async () => {
  // The cached contract has no schedule, but the server has one.
  let schedule: typeof SCHEDULED | null = null;
  server.use(
    http.get("/api/v1/contracts/:id", () =>
      HttpResponse.json(
        makeContract({ payment: PRE_ITEMS, has_prewedding: true, prewedding: schedule }),
      ),
    ),
  );
  const sent: Record<string, unknown>[] = [];
  server.use(
    http.patch("/api/v1/contracts/:id", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      sent.push(body);
      if (body.cancel_prewedding) return HttpResponse.json(makeContract({ version: 2 }));
      schedule = SCHEDULED;
      return problem(409, "o contrato tem um pré-wedding agendado", {
        code: "prewedding_scheduled",
      });
    }),
  );
  const { user } = renderApp(URL_PATH);
  const venue = await screen.findByLabelText("Local do evento");
  await user.clear(venue);
  await user.type(venue, "Capela");
  await user.click(screen.getByRole("button", { name: "Remover item 2" }));
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  const confirm = await screen.findByRole("dialog", { name: "Cancelar pré-wedding?" });
  expect(
    await within(confirm).findByText(
      "Este contrato tem um pré-wedding agendado em 20/01/2027. Remover o item cancela esse agendamento.",
    ),
  ).toBeInTheDocument();
  await user.click(within(confirm).getByRole("button", { name: "Remover e salvar" }));
  expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
  expect(sent.map((body) => body.cancel_prewedding)).toEqual([undefined, true]);
  expect(sent[1]).toMatchObject({ event: EVENT_REQUEST });
  expect(sent[1]).toHaveProperty("payment.items", [
    { service_id: IDS.serviceCeremony, amount_cents: 120000 },
  ]);
});

test("the Baixar PDF button is described by the save-first hint while there are changes", async () => {
  serveContract();
  const { user } = renderApp(URL_PATH);
  const download = await screen.findByRole("button", { name: "Baixar PDF" });
  expect(download).not.toHaveAccessibleDescription();

  await user.type(screen.getByLabelText("Local do evento"), "!");
  expect(download).toHaveAccessibleDescription("Salve as alterações antes de baixar o PDF.");

  await user.type(screen.getByLabelText("Local do evento"), "{Backspace}");
  expect(download).not.toHaveAccessibleDescription();
});

describe("Parcelas", () => {
  const PAID_PLAN = [
    { number: 1, month: "2026-10", amount_cents: 70000, paid_on: "2026-10-05" },
    { number: 2, month: "2026-11", amount_cents: 70000, paid_on: null },
  ];
  const capture = () => {
    const sent: { body?: Record<string, unknown> } = {};
    server.use(
      http.patch("/api/v1/contracts/:id", async ({ request }) => {
        sent.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeContract({ version: 2 }));
      }),
    );
    return sent;
  };

  test("a paid instalment is locked and says when it was paid", async () => {
    serveContract(makeContract({ instalments: PAID_PLAN }));
    renderApp(URL_PATH);
    const plan = within(await screen.findByRole("group", { name: "Parcelas" }));
    expect(await plan.findByText("paga em 05/10")).toBeInTheDocument();
    expect(screen.getByLabelText("Mês da parcela 1")).toBeDisabled();
    expect(screen.getByLabelText("Valor da parcela 1")).toBeDisabled();
    expect(screen.getByLabelText("Valor da parcela 1")).toHaveValue("700,00");
    expect(screen.getByLabelText("Mês da parcela 2")).toBeEnabled();
    expect(screen.getByLabelText("Valor da parcela 2")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  test("the count cannot drop below the instalments already paid", async () => {
    const three = [
      { number: 1, month: "2026-10", amount_cents: 40000, paid_on: "2026-10-05" },
      { number: 2, month: "2026-11", amount_cents: 40000, paid_on: "2026-11-05" },
      { number: 3, month: "2026-12", amount_cents: 60000, paid_on: null },
    ];
    serveContract(
      makeContract({
        instalments: three,
        payment: { ...makeContract().payment, total_cents: 140000 },
      }),
    );
    renderApp(URL_PATH);
    const count = await screen.findByLabelText("Nº de parcelas");
    expect(
      within(count)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["2", "3", "4"]);
  });

  test("a total change re-spreads only the unpaid instalments", async () => {
    serveContract(makeContract({ instalments: PAID_PLAN }));
    const sent = capture();
    const { user } = renderApp(URL_PATH);
    const amount = await screen.findByLabelText("Valor do item 1");
    await user.clear(amount);
    await user.type(amount, "1400");
    await user.tab();

    expect(screen.getByLabelText("Valor da parcela 1")).toHaveValue("700,00");
    expect(screen.getByLabelText("Valor da parcela 2")).toHaveValue("900,00");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas");
    // The server spreads the same way, so the plan is left for it to do.
    expect(sent.body).toEqual({
      payment: {
        items: [
          { service_id: IDS.serviceCeremony, amount_cents: 140000 },
          { service_id: IDS.serviceSecond, amount_cents: 50000 },
        ],
        pix_discount_cents: 30000,
      },
    });
  });

  test("a custom plan keeps its shape on a total change and the save leaves the plan out", async () => {
    const shaped = [
      { number: 1, month: "2026-10", amount_cents: 40000, paid_on: null },
      { number: 2, month: "2026-11", amount_cents: 40000, paid_on: null },
      { number: 3, month: "2026-12", amount_cents: 60000, paid_on: null },
    ];
    serveContract(makeContract({ instalments: shaped }));
    const sent = capture();
    const { user } = renderApp(URL_PATH);
    const amount = await screen.findByLabelText("Valor do item 1");
    await user.clear(amount);
    await user.type(amount, "1500");
    await user.tab();

    // Total 1.400 -> 1.700: R$ 100,00 more on each unpaid instalment, the shape kept.
    expect(screen.getByLabelText("Valor da parcela 1")).toHaveValue("500,00");
    expect(screen.getByLabelText("Valor da parcela 2")).toHaveValue("500,00");
    expect(screen.getByLabelText("Valor da parcela 3")).toHaveValue("700,00");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas");
    expect(sent.body).not.toHaveProperty("instalments");
  });

  test("a contract with no instalments can be repaired by choosing À vista", async () => {
    serveContract(makeContract({ instalments: [], plan_needs_review: true }));
    const sent = capture();
    const { user } = renderApp(URL_PATH);
    expect(
      await screen.findByText("Revise o plano de parcelas e salve para confirmar."),
    ).toBeVisible();
    const plan = within(screen.getByRole("group", { name: "Parcelas" }));
    await user.click(plan.getByRole("button", { name: /À vista/ }));
    expect(screen.getByLabelText("Valor da parcela 1")).toHaveValue("1.400,00");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas");
    expect(sent.body).toEqual({
      instalments: [{ month: currentMonth(), amount_cents: 140000 }],
    });
  });

  test("a hand-edited plan is sent with the paid rows unchanged", async () => {
    serveContract(makeContract({ instalments: PAID_PLAN }));
    const sent = capture();
    const { user } = renderApp(URL_PATH);
    const month = await screen.findByLabelText("Mês da parcela 2");
    fireEvent.change(month, { target: { value: "2026-12" } });
    fireEvent.blur(month);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas");
    expect(sent.body).toEqual({
      instalments: [
        { month: "2026-10", amount_cents: 70000 },
        { month: "2026-12", amount_cents: 70000 },
      ],
    });
  });

  test("a plan flagged for review is sent with the next save", async () => {
    serveContract(makeContract({ plan_needs_review: true }));
    const sent = capture();
    const { user } = renderApp(URL_PATH);
    const venue = await screen.findByLabelText("Local do evento");
    await user.clear(venue);
    await user.type(venue, "Capela");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas");
    expect(sent.body).toMatchObject({
      instalments: [{ month: "2026-10", amount_cents: 140000 }],
    });
  });

  test("a plan flagged for review shows a notice and can be saved as it is", async () => {
    serveContract(makeContract({ plan_needs_review: true }));
    const sent = capture();
    const { user } = renderApp(URL_PATH);
    expect(
      await screen.findByText("Revise o plano de parcelas e salve para confirmar."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alterações salvas");
    expect(sent.body).toEqual({ instalments: [{ month: "2026-10", amount_cents: 140000 }] });
  });

  test("À vista is unavailable while a paid instalment differs from the total", async () => {
    serveContract(makeContract({ instalments: PAID_PLAN }));
    renderApp(URL_PATH);
    const plan = within(await screen.findByRole("group", { name: "Parcelas" }));
    expect(plan.getByRole("button", { name: /À vista/ })).toBeDisabled();
    expect(plan.getByText(/À vista indisponível/)).toBeInTheDocument();
  });

  test("a paid row is a group whose inputs are described by when it was paid", async () => {
    serveContract(makeContract({ instalments: PAID_PLAN }));
    renderApp(URL_PATH);
    const row = within(await screen.findByRole("group", { name: "Parcela 1" }));
    expect(row.getByLabelText("Mês da parcela 1")).toHaveAccessibleDescription(/paga em 05\/10/);
    expect(row.getByLabelText("Valor da parcela 1")).toHaveAccessibleDescription(/paga em 05\/10/);
    expect(screen.getByRole("group", { name: "Parcela 2" })).toBeInTheDocument();
  });
});
