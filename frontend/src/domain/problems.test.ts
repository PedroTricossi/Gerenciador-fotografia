import { parseProblem, splitFieldErrors } from "./problems";

test("reads an RFC 9457 problem", () => {
  const problem = parseProblem(422, {
    type: "about:blank",
    title: "Unprocessable Content",
    status: 422,
    detail: "Request validation failed",
    request_id: "req-1",
    errors: [{ field: "groom.cpf", message: "CPF inválido" }],
  });
  expect(problem).toEqual({
    title: "Unprocessable Content",
    detail: "Request validation failed",
    errors: [{ field: "groom.cpf", message: "CPF inválido" }],
    requestId: "req-1",
  });
});

test.each([null, "oops", 42, { errors: "nope" }, { errors: [{ field: 1 }] }])(
  "tolerates a malformed body %j",
  (body) => {
    const problem = parseProblem(500, body);
    expect(problem.errors).toEqual([]);
    expect(problem.requestId).toBeNull();
    expect(problem.title).toBe("Erro 500");
  },
);

test("splits errors into known fields and the rest", () => {
  const known = new Set(["groom.cpf", "payment.items.0.amount_cents"]);
  const result = splitFieldErrors(
    [
      { field: "groom.cpf", message: "CPF inválido" },
      { field: "groom.cpf", message: "segunda mensagem" },
      { field: "payment.items.0.amount_cents", message: "deve ser maior que zero" },
      { field: "payment.items", message: "informe ao menos um item" },
      { field: "*", message: "Extra inputs are not permitted" },
      { field: "", message: "erro geral" },
    ],
    (path) => known.has(path),
  );
  expect(result.fields).toEqual({
    "groom.cpf": "CPF inválido",
    "payment.items.0.amount_cents": "deve ser maior que zero",
  });
  expect(result.other).toEqual([
    "payment.items: informe ao menos um item",
    "*: Extra inputs are not permitted",
    "erro geral",
  ]);
});
