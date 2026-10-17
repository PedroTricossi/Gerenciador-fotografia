import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { IDS, makeContract, problem, servicesHandler } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const PDF_HEADERS = {
  "Content-Type": "application/pdf",
  "Content-Disposition": 'attachment; filename="contrato-bruno-ana-2027-03-14.pdf"',
};

const EXPECTED_REQUEST = {
  groom: { full_name: "Bruno Costa", cpf: "12345678909" },
  bride: { full_name: "Ana Lima", cpf: "98765432100" },
  couple_address: "Rua das Flores 100",
  event: {
    date: "2027-03-14",
    venue_name: "Igreja Matriz",
    venue_address: null,
    coverage_start: "16:00",
    coverage_end: null,
    hours_contracted: null,
  },
  photographer_count: 2,
  payment: {
    items: [
      { service_id: IDS.serviceCeremony, amount_cents: 120000 },
      { service_id: IDS.serviceSecond, amount_cents: 50000 },
    ],
    pix_discount_cents: 30000,
  },
  signing: { city: "Curitiba", date: "2026-10-14" },
  instalments: [{ month: "2026-10", amount_cents: 140000 }],
};

// Date and time inputs take a whole value at once.
function setInput(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
  fireEvent.blur(element);
}

async function fillValidContract(user: UserEvent) {
  await user.type(screen.getByLabelText("Nome do noivo"), "Bruno Costa");
  await user.type(screen.getByLabelText("CPF do noivo"), "12345678909");
  await user.type(screen.getByLabelText("Nome da noiva"), "Ana Lima");
  await user.type(screen.getByLabelText("CPF da noiva"), "987.654.321-00");
  await user.type(screen.getByLabelText("Endereço do casal"), "Rua das Flores 100");
  setInput(screen.getByLabelText("Data do evento"), "2027-03-14");
  await user.type(screen.getByLabelText("Local do evento"), "Igreja Matriz");
  setInput(screen.getByLabelText("Início da cobertura"), "16:00");
  await user.selectOptions(
    await screen.findByLabelText("Serviço do item 1"),
    "Cobertura da cerimônia na igreja",
  );
  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  await user.selectOptions(screen.getByLabelText("Serviço do item 2"), "Diária segundo fotógrafo");
  await user.type(screen.getByLabelText("Desconto PIX"), "300");
  await user.tab();
}

let anchors: HTMLAnchorElement[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 14, 10, 0) });
  anchors = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    anchors.push(this);
  });
  server.use(
    http.get("/api/v1/contracts/:id", () => HttpResponse.json(makeContract())),
    http.get(
      "/api/v1/contracts/:id/pdf",
      () => new HttpResponse(new Blob(["%PDF-1.7"]), { headers: PDF_HEADERS }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

test("starts with the defaults", async () => {
  renderApp("/contratos/novo");
  expect(screen.getByRole("heading", { level: 1, name: "Novo contrato" })).toBeInTheDocument();
  expect(screen.getByLabelText("Cidade da assinatura")).toHaveValue("Curitiba");
  expect(screen.getByLabelText("Data da assinatura")).toHaveValue("2026-10-14");
  expect(screen.getByLabelText("Número de fotógrafos")).toHaveValue(2);
  expect(
    await within(screen.getByRole("group", { name: "Pagamento" })).findByText("—"),
  ).toBeInTheDocument();
});

test("an empty form is not sent and every required input says so", async () => {
  const posted = vi.fn();
  server.use(
    http.post("/api/v1/contracts", () => {
      posted();
      return HttpResponse.json({});
    }),
  );
  const { user } = renderApp("/contratos/novo");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  for (const label of ["Nome do noivo", "CPF do noivo", "Data do evento"]) {
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription("campo obrigatório");
  }
  // The money input is also described as "em reais".
  expect(screen.getByLabelText("Valor do item 1")).toHaveAccessibleDescription(
    expect.stringContaining("campo obrigatório"),
  );
  // This input also has a hint, which is part of its description.
  expect(screen.getByLabelText("Endereço do casal")).toHaveAccessibleDescription(
    /campo obrigatório/,
  );
  expect(posted).not.toHaveBeenCalled();
});

test("CPFs are checked and formatted as you leave the input", async () => {
  const { user } = renderApp("/contratos/novo");
  await user.type(screen.getByLabelText("CPF do noivo"), "12345678909");
  await user.tab();
  expect(screen.getByLabelText("CPF do noivo")).toHaveValue("123.456.789-09");
  await user.type(screen.getByLabelText("CPF da noiva"), "12345678900");
  await user.tab();
  expect(screen.getByLabelText("CPF da noiva")).toHaveAccessibleDescription("CPF inválido");
  await user.clear(screen.getByLabelText("CPF da noiva"));
  await user.type(screen.getByLabelText("CPF da noiva"), "123.456.789-09");
  await user.tab();
  expect(screen.getByLabelText("CPF da noiva")).toHaveAccessibleDescription(
    "os CPFs dos contratantes devem ser diferentes",
  );
});

test("items can be added and removed and the total follows", async () => {
  const { user } = renderApp("/contratos/novo");
  const payment = () => within(screen.getByRole("group", { name: "Pagamento" }));
  await screen.findByLabelText("Valor do item 1");
  expect(screen.getByRole("button", { name: "Remover item 1" })).toBeDisabled();

  await user.type(screen.getByLabelText("Valor do item 1"), "1200");
  await user.tab();
  expect(screen.getByLabelText("Valor do item 1")).toHaveValue("1.200,00");
  expect(payment().getByText("R$ 1.200,00")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  await user.type(screen.getByLabelText("Valor do item 2"), "500");
  expect(payment().getByText("R$ 1.700,00")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Desconto PIX"), "300");
  expect(payment().getByText("R$ 1.400,00")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Remover item 1" }));
  // "500" was tidied to "500,00" when the input lost focus.
  expect(screen.getByLabelText("Valor do item 1")).toHaveValue("500,00");
  expect(payment().getByText("R$ 200,00")).toBeInTheDocument();
});

test("no more than 20 items", async () => {
  const { user } = renderApp("/contratos/novo");
  const add = await screen.findByRole("button", { name: "Adicionar item" });
  for (let count = 1; count < 20; count += 1) await user.click(add);
  expect(screen.getByLabelText("Valor do item 20")).toBeInTheDocument();
  expect(add).toBeDisabled();
});

test("saving sends the contract, downloads its PDF and opens it", async () => {
  let body: unknown;
  server.use(
    http.post("/api/v1/contracts", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(body).toEqual(EXPECTED_REQUEST);
  expect(anchors).toHaveLength(1);
  expect(anchors[0]!.download).toBe("contrato-bruno-ana-2027-03-14.pdf");
  expect(screen.getByText("Contrato salvo")).toBeInTheDocument();
});

test("server validation errors land on their inputs, the rest in a banner", async () => {
  server.use(
    http.post("/api/v1/contracts", () =>
      problem(422, "Request validation failed", {
        errors: [
          { field: "groom.cpf", message: "CPF recusado pelo servidor" },
          { field: "payment.items.1.amount_cents", message: "valor recusado" },
          { field: "payment.items", message: "informe ao menos um item" },
        ],
      }),
    ),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "payment.items: informe ao menos um item",
  );
  expect(screen.getByLabelText("CPF do noivo")).toHaveAccessibleDescription(
    "CPF recusado pelo servidor",
  );
  expect(screen.getByLabelText("Valor do item 2")).toHaveAccessibleDescription(
    expect.stringContaining("valor recusado"),
  );
  expect(router.state.location.pathname).toBe("/contratos/novo");
});

test("a double click sends one request", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const posted = vi.fn();
  server.use(
    http.post("/api/v1/contracts", async () => {
      posted();
      await gate;
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.dblClick(screen.getByRole("button", { name: "Salvar" }));
  await user.keyboard("{Enter}");
  release();
  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(posted).toHaveBeenCalledOnce();
});

test("a failed PDF after a successful save keeps the contract and says so", async () => {
  server.use(
    http.post("/api/v1/contracts", () => HttpResponse.json(makeContract(), { status: 201 })),
    http.get("/api/v1/contracts/:id/pdf", () => problem(500, "boom")),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(
    screen.getByText(
      "Contrato salvo, mas o PDF não foi baixado. Use Baixar PDF na página do contrato.",
    ),
  ).toBeInTheDocument();
});

test("a refusal that is not a validation error shows in the banner and stays on the form", async () => {
  server.use(http.post("/api/v1/contracts", () => problem(429, "Too many requests")));
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "O servidor recusou o pedido. Código: req-429",
  );
  expect(router.state.location.pathname).toBe("/contratos/novo");
});

test("removing an item moves the other item's error with it", async () => {
  const { user } = renderApp("/contratos/novo");
  await user.type(await screen.findByLabelText("Valor do item 1"), "abc");
  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  await user.type(screen.getByLabelText("Valor do item 2"), "0,00");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  expect(screen.getByLabelText("Valor do item 1")).toHaveAccessibleDescription(
    expect.stringContaining("valor inválido"),
  );
  expect(screen.getByLabelText("Valor do item 2")).toHaveAccessibleDescription(
    expect.stringContaining("o valor deve ser maior que zero"),
  );

  await user.click(screen.getByRole("button", { name: "Remover item 1" }));
  expect(screen.getByLabelText("Valor do item 1")).toHaveAccessibleDescription(
    expect.stringContaining("o valor deve ser maior que zero"),
  );
});

test("choosing a service fills its price, which stays editable", async () => {
  const { user } = renderApp("/contratos/novo");
  const amount = await screen.findByLabelText("Valor do item 1");
  await user.selectOptions(screen.getByLabelText("Serviço do item 1"), "Ensaio de pré-wedding");
  expect(amount).toHaveValue("800,00");
  await user.clear(amount);
  await user.type(amount, "650");
  await user.tab();
  expect(amount).toHaveValue("650,00");
  await user.selectOptions(screen.getByLabelText("Serviço do item 1"), "Diária segundo fotógrafo");
  expect(amount).toHaveValue("500,00");
});

test("a service chosen in one row is disabled in the others", async () => {
  const { user } = renderApp("/contratos/novo");
  await user.selectOptions(
    await screen.findByLabelText("Serviço do item 1"),
    "Diária segundo fotógrafo",
  );
  await user.click(screen.getByRole("button", { name: "Adicionar item" }));
  const second = screen.getByLabelText("Serviço do item 2");
  expect(within(second).getByRole("option", { name: "Diária segundo fotógrafo" })).toBeDisabled();
  expect(within(second).queryByRole("option", { name: /Álbum antigo/ })).toBeNull();
});

test("with no services, the form links to the catalog", async () => {
  server.use(servicesHandler([]));
  renderApp("/contratos/novo");
  expect(await screen.findByRole("link", { name: "Cadastre os serviços" })).toHaveAttribute(
    "href",
    "/servicos",
  );
});

test("a failed first load of the services offers a retry", async () => {
  server.use(http.get("/api/v1/services", () => problem(500, "boom")));
  const { user } = renderApp("/contratos/novo");
  expect(await screen.findByText(/Não foi possível carregar os serviços\./)).toBeInTheDocument();
  server.use(servicesHandler());
  await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(await screen.findByLabelText("Serviço do item 1")).toBeInTheDocument();
});

test("a failed refetch keeps the item rows on screen", async () => {
  const { user, router } = renderApp("/contratos/novo");
  await screen.findByLabelText("Serviço do item 1");
  await user.click(screen.getByRole("link", { name: "Serviços" }));
  await screen.findByRole("heading", { level: 1, name: "Serviços" });
  let failed = false;
  server.use(
    http.get("/api/v1/services", () => {
      failed = true;
      return problem(500, "boom");
    }),
  );
  await act(() => router.navigate("/contratos/novo"));
  await waitFor(() => expect(failed).toBe(true));
  expect(await screen.findByLabelText("Serviço do item 1")).toBeInTheDocument();
  expect(screen.queryByText(/Não foi possível carregar os serviços/)).toBeNull();
});

test("a server error on a service lands on that row", async () => {
  server.use(
    http.post("/api/v1/contracts", () =>
      problem(422, "Request validation failed", {
        errors: [{ field: "payment.items.1.service_id", message: "serviço arquivado" }],
      }),
    ),
  );
  const { user } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText("serviço arquivado")).toBeInTheDocument();
  expect(screen.getByLabelText("Serviço do item 2")).toHaveAttribute("aria-invalid", "true");
});

async function pickPrewedding(user: UserEvent, index = 2) {
  await user.selectOptions(
    screen.getByLabelText(`Serviço do item ${index}`),
    "Ensaio de pré-wedding",
  );
}

test("the pre-wedding section follows the pre-wedding item", async () => {
  const { user } = renderApp("/contratos/novo");
  await fillValidContract(user);
  expect(screen.queryByRole("group", { name: "Pré-wedding" })).toBeNull();

  await pickPrewedding(user);
  const section = screen.getByRole("group", { name: "Pré-wedding" });
  expect(within(section).getByText("Pode deixar em branco e agendar depois.")).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Serviço do item 2"), "Diária segundo fotógrafo");
  expect(screen.queryByRole("group", { name: "Pré-wedding" })).toBeNull();
});

test("a filled pre-wedding is sent with the contract", async () => {
  let body: Record<string, unknown> | undefined;
  server.use(
    http.post("/api/v1/contracts", async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await pickPrewedding(user);
  setInput(screen.getByLabelText("Data do pré-wedding"), "2027-01-20");
  await user.type(screen.getByLabelText("Local do pré-wedding"), "Parque Barigui");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(body?.prewedding).toEqual({
    date: "2027-01-20",
    venue_name: "Parque Barigui",
    venue_address: null,
    start_time: null,
  });
});

test("a half-filled pre-wedding asks for the missing date", async () => {
  const { user } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await pickPrewedding(user);
  await user.type(screen.getByLabelText("Local do pré-wedding"), "Parque Barigui");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  const section = screen.getByRole("group", { name: "Pré-wedding" });
  expect(await within(section).findByText("campo obrigatório")).toBeInTheDocument();
});

test("hidden pre-wedding values are not sent", async () => {
  let body: Record<string, unknown> | undefined;
  server.use(
    http.post("/api/v1/contracts", async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makeContract(), { status: 201 });
    }),
  );
  const { user, router } = renderApp("/contratos/novo");
  await fillValidContract(user);
  await pickPrewedding(user);
  await user.type(screen.getByLabelText("Local do pré-wedding"), "Parque Barigui");
  await user.selectOptions(screen.getByLabelText("Serviço do item 2"), "Diária segundo fotógrafo");
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`));
  expect(body).toEqual(EXPECTED_REQUEST);
});
