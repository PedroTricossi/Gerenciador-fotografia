import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { IDS, makeClient, makeContract, page, problem } from "../../test/fixtures";
import { renderApp } from "../../test/render";
import { server } from "../../test/server";

const SECOND_ID = "6f1c0a52-1111-4000-8000-000000000099";
const second = makeContract({
  id: SECOND_ID,
  groom: makeClient({ id: "g2", full_name: "Caio Reis" }),
  bride: makeClient({ id: "b2", full_name: "Duda Melo" }),
  event: { ...makeContract().event, date: "2027-05-01", venue_name: "Chácara Sol" },
  payment: {
    items: [{ service_id: IDS.serviceCeremony, description: "Cerimônia", amount_cents: 99000 }],
    pix_discount_cents: null,
    total_cents: 99000,
  },
});

function row(name: RegExp) {
  return screen.getByRole("row", { name });
}

test("lists couple, event date, venue and total", async () => {
  server.use(http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))));
  renderApp("/contratos");
  const contract = await screen.findByRole("row", { name: /Bruno & Ana/ });
  expect(contract).toHaveTextContent("14/03/2027");
  expect(contract).toHaveTextContent("Igreja Matriz");
  expect(contract).toHaveTextContent("R$ 1.400,00");
});

test("an empty list offers a new contract", async () => {
  server.use(http.get("/api/v1/contracts", () => HttpResponse.json(page([]))));
  const { user, router } = renderApp("/contratos");
  expect(await screen.findByText("Nenhum contrato ainda")).toBeInTheDocument();
  const buttons = screen.getAllByRole("button", { name: "Novo contrato" });
  await user.click(buttons[buttons.length - 1]!);
  expect(router.state.location.pathname).toBe("/contratos/novo");
});

test("Carregar mais fetches the next page", async () => {
  server.use(
    http.get("/api/v1/contracts", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json(cursor === "c2" ? page([second]) : page([makeContract()], "c2"));
    }),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(screen.getByRole("button", { name: "Carregar mais" }));
  expect(await screen.findByRole("row", { name: /Caio & Duda/ })).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /Bruno & Ana/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
});

test("Excluir asks first, deletes, and Desfazer restores", async () => {
  let deleted = false;
  const restored = vi.fn();
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page(deleted ? [] : [makeContract()]))),
    http.delete("/api/v1/contracts/:id", () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/v1/contracts/:id/restore", ({ params }) => {
      restored(params.id);
      deleted = false;
      return HttpResponse.json(makeContract());
    }),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });

  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Excluir" }));
  const dialog = screen.getByRole("dialog", { name: "Excluir contrato" });
  await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

  await waitFor(() =>
    expect(screen.queryByRole("row", { name: /Bruno & Ana/ })).not.toBeInTheDocument(),
  );
  expect(screen.getByText("Contrato excluído")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(await screen.findByRole("row", { name: /Bruno & Ana/ })).toBeInTheDocument();
  expect(restored).toHaveBeenCalledWith(IDS.contract);
});

test("Mostrar excluídos lists deleted contracts with Restaurar, and explains a refused restore", async () => {
  const deletedContract = makeContract({ deleted_at: "2026-10-14T10:00:00Z" });
  server.use(
    http.get("/api/v1/contracts", ({ request }) => {
      const include = new URL(request.url).searchParams.get("include_deleted") === "true";
      return HttpResponse.json(page(include ? [deletedContract] : []));
    }),
    http.post("/api/v1/contracts/:id/restore", () =>
      problem(409, "a client of this contract has been anonymised"),
    ),
  );
  const { user } = renderApp("/contratos");
  await screen.findByText("Nenhum contrato ainda");
  await user.click(screen.getByLabelText("Mostrar excluídos"));

  const deletedRow = await screen.findByRole("row", { name: /Bruno & Ana/ });
  expect(deletedRow).toHaveTextContent("Excluído");
  expect(within(deletedRow).queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  await user.click(within(deletedRow).getByRole("button", { name: "Restaurar" }));
  expect(
    await screen.findByText(
      "Não é possível restaurar: um dos clientes deste contrato foi anonimizado.",
    ),
  ).toBeInTheDocument();
});

test("Baixar PDF saves the file under the server's name", async () => {
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))),
    http.get(
      "/api/v1/contracts/:id/pdf",
      () =>
        new HttpResponse(new Blob(["%PDF-1.7"]), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="contrato-bruno-ana-2027-03-14.pdf"',
          },
        }),
    ),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Baixar PDF" }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]!.download).toBe("contrato-bruno-ana-2027-03-14.pdf");
});

test("Editar opens the contract", async () => {
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))),
    http.get("/api/v1/contracts/:id", () => HttpResponse.json(makeContract())),
  );
  const { user, router } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Editar" }));
  expect(router.state.location.pathname).toBe(`/contratos/${IDS.contract}`);
});

test("a failed load says so and offers a retry", async () => {
  let fail = true;
  server.use(
    http.get("/api/v1/contracts", () =>
      fail ? problem(500, "boom") : HttpResponse.json(page([makeContract()])),
    ),
  );
  const { user } = renderApp("/contratos");
  expect(await screen.findByText("Não foi possível carregar os contratos.")).toBeInTheDocument();
  expect(screen.getByText("Erro no servidor. Código: req-500")).toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(await screen.findByRole("row", { name: /Bruno & Ana/ })).toBeInTheDocument();
});

test("a 409 on Excluir says the contract is already deleted and refetches the list", async () => {
  let lists = 0;
  server.use(
    http.get("/api/v1/contracts", () => {
      lists += 1;
      return HttpResponse.json(page([makeContract()]));
    }),
    http.delete("/api/v1/contracts/:id", () => problem(409, "already deleted")),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Excluir" }));
  const dialog = screen.getByRole("dialog", { name: "Excluir contrato" });
  await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
  expect(
    await screen.findByText("Este contrato já foi excluído. A lista foi atualizada."),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Não é possível restaurar/)).not.toBeInTheDocument();
  await waitFor(() => expect(lists).toBe(2));
});

test("a 422 on Excluir is explained instead of swallowed", async () => {
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))),
    http.delete("/api/v1/contracts/:id", () => problem(422, "nope")),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Excluir" }));
  const dialog = screen.getByRole("dialog", { name: "Excluir contrato" });
  await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
  expect(
    await screen.findByText("O servidor recusou o pedido. Código: req-422"),
  ).toBeInTheDocument();
});

test("a 409 on Baixar PDF says the contract was deleted", async () => {
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([makeContract()]))),
    http.get("/api/v1/contracts/:id/pdf", () => problem(409, "deleted")),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Baixar PDF" }));
  expect(
    await screen.findByText("Este contrato foi excluído. Restaure-o para baixar o PDF."),
  ).toBeInTheDocument();
});

test("a 404 on Baixar PDF says the contract is gone and refetches the list", async () => {
  let lists = 0;
  server.use(
    http.get("/api/v1/contracts", () => {
      lists += 1;
      return HttpResponse.json(page([makeContract()]));
    }),
    http.get("/api/v1/contracts/:id/pdf", () => problem(404, "missing")),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Baixar PDF" }));
  expect(
    await screen.findByText("Este contrato não existe mais. A lista foi atualizada."),
  ).toBeInTheDocument();
  await waitFor(() => expect(lists).toBe(2));
});

test("actions keep one order, with the pré-wedding slot kept on every row", async () => {
  const withPrewedding = makeContract({
    has_prewedding: true,
    prewedding: {
      date: "2027-05-12",
      venue_name: "Parque",
      venue_address: "",
      start_time: "16:00",
      version: 1,
    },
  });
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page([withPrewedding, second]))),
  );
  renderApp("/contratos");
  const first = await screen.findByRole("row", { name: /Bruno & Ana/ });
  const names = (r: HTMLElement) =>
    within(r)
      .getAllByRole("button")
      .map((b) => b.textContent);
  expect(names(first)).toEqual(["Editar", "Baixar PDF", "Pré-wedding 12/05", "Excluir"]);
  const other = row(/Caio & Duda/);
  expect(names(other)).toEqual(["Editar", "Baixar PDF", "Excluir"]);
  const actions = within(other).getByRole("button", { name: "Excluir" }).parentElement;
  expect(actions?.children).toHaveLength(4);
});

test("Desfazer still reports a refused restore after leaving the page", async () => {
  let deleted = false;
  server.use(
    http.get("/api/v1/contracts", () => HttpResponse.json(page(deleted ? [] : [makeContract()]))),
    http.delete("/api/v1/contracts/:id", () => {
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("/api/v1/contracts/:id/restore", () => problem(409, "anonymised")),
    http.get("/api/v1/clients", () => HttpResponse.json(page([]))),
  );
  const { user } = renderApp("/contratos");
  await screen.findByRole("row", { name: /Bruno & Ana/ });
  await user.click(within(row(/Bruno & Ana/)).getByRole("button", { name: "Excluir" }));
  const dialog = screen.getByRole("dialog", { name: "Excluir contrato" });
  await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
  await screen.findByText("Contrato excluído");
  await user.click(screen.getByRole("link", { name: "Clientes" }));
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(
    await screen.findByText(
      "Não é possível restaurar: um dos clientes deste contrato foi anonimizado.",
    ),
  ).toBeInTheDocument();
});
