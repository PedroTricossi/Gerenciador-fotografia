import { IDS, makeContract } from "../../test/fixtures";
import {
  type ContractFormValues,
  defaultValues,
  formTotal,
  fromContract,
  formPath,
  isFormField,
  moneyText,
  planFollowsTotal,
  resizePlan,
  respreadForTotal,
  splitUnpaid,
  toRequest,
  validate,
} from "./formModel";
import { emptyPrewedding } from "./preweddingForm";

function valid(): ContractFormValues {
  return {
    groom: { full_name: "Bruno Costa", cpf: "123.456.789-09" },
    bride: { full_name: "Ana Lima", cpf: "98765432100" },
    couple_address: "Rua das Flores 100",
    event: {
      date: "2027-03-14",
      venue_name: "Igreja Matriz",
      venue_address: "",
      coverage_start: "16:00",
      coverage_end: "",
      hours_contracted: "",
    },
    photographer_count: "2",
    payment: {
      items: [
        { service_id: IDS.serviceCeremony, amount_cents: "1.200,00" },
        { service_id: IDS.serviceSecond, amount_cents: "500" },
      ],
      pix_discount_cents: "300",
    },
    plan: { mode: "single", rows: [{ month: "2026-10", amount: "1.400,00", paidOn: null }] },
    signing: { city: "Curitiba", date: "2026-10-13" },
    prewedding: emptyPrewedding(),
  };
}

test("defaults: one empty item, two photographers, Curitiba, signed today", () => {
  const values = defaultValues("2026-10-14");
  expect(values.payment.items).toEqual([{ service_id: "", amount_cents: "" }]);
  expect(values.photographer_count).toBe("2");
  expect(values.signing).toEqual({ city: "Curitiba", date: "2026-10-14" });
});

test("toRequest converts text to the API's types", () => {
  expect(toRequest(valid())).toEqual({
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
    instalments: [{ month: "2026-10", amount_cents: 140000 }],
    signing: { city: "Curitiba", date: "2026-10-13" },
  });
});

test("toRequest trims text and reads optional numbers", () => {
  const values = valid();
  values.groom.full_name = "  Bruno Costa  ";
  values.event.hours_contracted = "6";
  values.payment.pix_discount_cents = "  ";
  const request = toRequest(values);
  expect(request.groom.full_name).toBe("Bruno Costa");
  expect(request.event.hours_contracted).toBe(6);
  expect(request.payment.pix_discount_cents).toBeNull();
});

test("fromContract fills the form, and converting back gives the same request", () => {
  const contract = makeContract();
  const values = fromContract(contract);
  expect(values.groom.cpf).toBe("123.456.789-09");
  expect(values.event.coverage_start).toBe("16:00");
  expect(values.payment.items[0]!.amount_cents).toBe("1.200,00");
  expect(values.payment.pix_discount_cents).toBe("300,00");
  expect(toRequest(values)).toEqual({
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
    instalments: [{ month: "2026-10", amount_cents: 140000 }],
    signing: { city: "Curitiba", date: "2026-10-13" },
  });
});

test("fromContract tolerates anonymised people and a missing address", () => {
  const contract = makeContract({ couple_address: null });
  contract.groom = { ...contract.groom, full_name: null, cpf: null, address: null };
  const values = fromContract(contract);
  expect(values.groom).toEqual({ full_name: "", cpf: "" });
  expect(values.couple_address).toBe("");
});

test("a valid form has no errors", () => {
  expect(validate(valid())).toEqual({});
});

test("every item needs a service, and a service appears once", () => {
  const values = valid();
  values.payment.items[0]!.service_id = "";
  values.payment.items.push({ service_id: IDS.serviceSecond, amount_cents: "10" });
  expect(validate(values)).toMatchObject({
    "payment.items.0.service_id": "selecione um serviço",
    "payment.items.2.service_id": "serviço repetido no contrato",
  });
});

test("an empty form names every required input", () => {
  const errors = validate(defaultValues("2026-10-14"));
  for (const path of [
    "groom.full_name",
    "groom.cpf",
    "bride.full_name",
    "bride.cpf",
    "couple_address",
    "event.date",
    "event.venue_name",
    "payment.items.0.amount_cents",
  ]) {
    expect(errors[path]).toBe("campo obrigatório");
  }
  expect(errors["payment.items.0.service_id"]).toBe("selecione um serviço");
  expect(errors["signing.city"]).toBeUndefined();
});

test.each<[string, (values: ContractFormValues) => void, string, string]>([
  ["invalid CPF", (v) => (v.groom.cpf = "123.456.789-00"), "groom.cpf", "CPF inválido"],
  [
    "same CPFs",
    (v) => (v.bride.cpf = "12345678909"),
    "bride.cpf",
    "os CPFs dos contratantes devem ser diferentes",
  ],
  [
    "long name",
    (v) => (v.bride.full_name = "a".repeat(201)),
    "bride.full_name",
    "máximo de 200 caracteres",
  ],
  [
    "long address",
    (v) => (v.couple_address = "a".repeat(301)),
    "couple_address",
    "máximo de 300 caracteres",
  ],
  [
    "long city",
    (v) => (v.signing.city = "a".repeat(101)),
    "signing.city",
    "máximo de 100 caracteres",
  ],
  ["blank city", (v) => (v.signing.city = " "), "signing.city", "campo obrigatório"],
  ["blank signing date", (v) => (v.signing.date = ""), "signing.date", "campo obrigatório"],
  [
    "control character",
    (v) => (v.event.venue_name = "Igreja\tMatriz"),
    "event.venue_name",
    "não pode conter caracteres de controle",
  ],
  [
    "hours 0",
    (v) => (v.event.hours_contracted = "0"),
    "event.hours_contracted",
    "informe de 1 a 24 horas",
  ],
  [
    "hours 25",
    (v) => (v.event.hours_contracted = "25"),
    "event.hours_contracted",
    "informe de 1 a 24 horas",
  ],
  [
    "hours 2.5",
    (v) => (v.event.hours_contracted = "2.5"),
    "event.hours_contracted",
    "informe de 1 a 24 horas",
  ],
  [
    "photographers 0",
    (v) => (v.photographer_count = "0"),
    "photographer_count",
    "informe de 1 a 10 fotógrafos",
  ],
  [
    "photographers blank",
    (v) => (v.photographer_count = ""),
    "photographer_count",
    "informe de 1 a 10 fotógrafos",
  ],
  [
    "amount text",
    (v) => (v.payment.items[1]!.amount_cents = "abc"),
    "payment.items.1.amount_cents",
    "valor inválido",
  ],
  [
    "amount zero",
    (v) => (v.payment.items[1]!.amount_cents = "0,00"),
    "payment.items.1.amount_cents",
    "o valor deve ser maior que zero",
  ],
  [
    "amount too big",
    (v) => (v.payment.items[1]!.amount_cents = "1.000.000,01"),
    "payment.items.1.amount_cents",
    "valor máximo R$ 1.000.000,00",
  ],
  [
    "discount text",
    (v) => (v.payment.pix_discount_cents = "x"),
    "payment.pix_discount_cents",
    "valor inválido",
  ],
  [
    "discount too big",
    (v) => (v.payment.pix_discount_cents = "1.700,00"),
    "payment.pix_discount_cents",
    "o desconto deve ser maior que zero e menor que a soma dos itens",
  ],
])("%s", (_name, change, path, message) => {
  const values = valid();
  change(values);
  expect(validate(values)[path]).toBe(message);
});

test.each<[string, (values: ContractFormValues) => void, string]>([
  [
    "trailing newline on venue",
    (v) => (v.event.venue_name = "Igreja Matriz\n"),
    "event.venue_name",
  ],
  ["leading tab on address", (v) => (v.couple_address = "\tRua das Flores 100"), "couple_address"],
])("%s is stripped before the control check", (_name, change, path) => {
  const values = valid();
  change(values);
  expect(validate(values)[path]).toBeUndefined();
  expect(toRequest(values)).toBeDefined();
});

test("an astral character counts once toward the length limit", () => {
  const accepted = valid();
  accepted.bride.full_name = "\u{1D49C}".repeat(200);
  expect(validate(accepted)["bride.full_name"]).toBeUndefined();
  const refused = valid();
  refused.bride.full_name = "\u{1D49C}".repeat(201);
  expect(validate(refused)["bride.full_name"]).toBe("máximo de 200 caracteres");
});

test("the total follows the typed values", () => {
  expect(formTotal(valid())).toBe(140000);
  const values = valid();
  values.payment.items[1]!.amount_cents = "";
  expect(formTotal(values)).toBeNull();
});

test("moneyText tidies a valid amount and leaves anything else alone", () => {
  expect(moneyText("1200")).toBe("1.200,00");
  expect(moneyText(" 1200,5 ")).toBe("1.200,50");
  expect(moneyText("abc")).toBe("abc");
  expect(moneyText("")).toBe("");
  expect(moneyText("0")).toBe("0");
});

test.each([
  ["groom.cpf", 1, true],
  ["signing.date", 1, true],
  ["payment.items.0.amount_cents", 1, true],
  ["payment.items.1.service_id", 2, true],
  ["payment.items.2.service_id", 2, false],
  ["payment.items", 2, false],
  ["payment", 1, false],
  ["*", 1, false],
  ["", 1, false],
])("isFormField(%j, %i) is %s", (path, count, expected) => {
  expect(isFormField(path, count)).toBe(expected);
});

test("a blank pre-wedding is left out of the request", () => {
  expect(toRequest(valid())).not.toHaveProperty("prewedding");
});

test("a filled pre-wedding is sent and needs a date and a place", () => {
  const values = {
    ...valid(),
    prewedding: { date: "", venue_name: "Parque", venue_address: "", start_time: "16:00" },
  };
  expect(validate(values)).toEqual({ "prewedding.date": "campo obrigatório" });
  values.prewedding.date = "2027-01-20";
  expect(validate(values)).toEqual({});
  expect(toRequest(values).prewedding).toEqual({
    date: "2027-01-20",
    venue_name: "Parque",
    venue_address: null,
    start_time: "16:00",
  });
});

test("pre-wedding fields are form fields for server errors", () => {
  expect(isFormField("prewedding.venue_name", 1)).toBe(true);
  expect(isFormField("prewedding", 1)).toBe(false);
});

test("defaults: one À vista row in the current month", () => {
  expect(defaultValues("2026-10-14").plan).toEqual({
    mode: "single",
    rows: [{ month: "2026-10", amount: "", paidOn: null }],
  });
});

test("fromContract fills the plan, with paid dates", () => {
  const contract = makeContract({
    instalments: [
      { number: 1, month: "2026-10", amount_cents: 70000, paid_on: "2026-10-05" },
      { number: 2, month: "2026-11", amount_cents: 70000, paid_on: null },
    ],
  });
  expect(fromContract(contract).plan).toEqual({
    mode: "split",
    rows: [
      { month: "2026-10", amount: "700,00", paidOn: "2026-10-05" },
      { month: "2026-11", amount: "700,00", paidOn: null },
    ],
  });
  expect(toRequest(fromContract(contract)).instalments).toEqual([
    { month: "2026-10", amount_cents: 70000 },
    { month: "2026-11", amount_cents: 70000 },
  ]);
});

describe("plan validation", () => {
  const withRows = (rows: { month: string; amount: string }[]) => {
    const values = valid();
    values.plan = { mode: "split", rows: rows.map((row) => ({ ...row, paidOn: null })) };
    return values;
  };

  test("the sum must equal the total", () => {
    const errors = validate(
      withRows([
        { month: "2026-10", amount: "100" },
        { month: "2026-11", amount: "1.000" },
      ]),
    );
    expect(errors).toEqual({ "plan.sum": "a soma das parcelas deve ser igual ao total" });
  });

  test("months must strictly increase and amounts be above zero", () => {
    const errors = validate(
      withRows([
        { month: "2026-11", amount: "1.400,00" },
        { month: "2026-11", amount: "0" },
      ]),
    );
    expect(errors["plan.rows.1.month"]).toBe("os meses das parcelas devem ser crescentes");
    expect(errors["plan.rows.1.amount"]).toBe("o valor deve ser maior que zero");
    expect(errors["plan.sum"]).toBeUndefined();
  });

  test("an empty month is required", () => {
    expect(validate(withRows([{ month: "", amount: "1.400,00" }]))["plan.rows.0.month"]).toBe(
      "campo obrigatório",
    );
  });
});

describe("plan arithmetic", () => {
  const row = (month: string, amount: string, paidOn: string | null = null) => ({
    month,
    amount,
    paidOn,
  });

  test("resizePlan adds consecutive months across a year end and drops unpaid rows", () => {
    const grown = resizePlan([row("2026-12", "")], 3);
    expect(grown.map((r) => r.month)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(resizePlan(grown, 2).map((r) => r.month)).toEqual(["2026-12", "2027-01"]);
    expect(resizePlan([row("2026-10", "1", "2026-10-05"), row("2026-11", "")], 1)).toHaveLength(1);
  });

  test("splitUnpaid shares what the paid rows leave, extra centavos on the last", () => {
    const rows = [row("2026-10", "100,00", "2026-10-05"), row("2026-11", ""), row("2026-12", "")];
    expect(splitUnpaid(rows, 20001)?.map((r) => r.amount)).toEqual(["100,00", "50,00", "50,01"]);
    expect(splitUnpaid(rows, 100)).toBeNull();
  });

  test("respreadForTotal leaves a plan that adds up and spreads one that does not", () => {
    const plan = {
      mode: "split" as const,
      rows: [row("2026-10", "30,00"), row("2026-11", "70,00")],
    };
    expect(respreadForTotal(plan, 10000)).toBe(plan.rows);
    expect(respreadForTotal(plan, 20000)?.map((r) => r.amount)).toEqual(["100,00", "100,00"]);
  });

  test("planFollowsTotal tells the server's own spread from a hand-made plan", () => {
    const contract = makeContract({
      instalments: [
        { number: 1, month: "2026-10", amount_cents: 70000, paid_on: "2026-10-05" },
        { number: 2, month: "2026-11", amount_cents: 70000, paid_on: null },
      ],
    });
    const values = fromContract(contract);
    values.payment.items[0]!.amount_cents = "1.400,00";
    values.plan.rows[1]!.amount = "900,00";
    expect(planFollowsTotal(contract, values)).toBe(true);
    values.plan.rows[1]!.month = "2026-12";
    expect(planFollowsTotal(contract, values)).toBe(false);
  });
});

test("server plan paths map onto the plan's form fields", () => {
  expect(isFormField("instalments", 1)).toBe(true);
  expect(isFormField("instalments.1.month", 1, 2)).toBe(true);
  expect(isFormField("instalments.2.amount_cents", 1, 2)).toBe(false);
  expect(formPath("instalments")).toBe("plan.sum");
  expect(formPath("instalments.1.month")).toBe("plan.rows.1.month");
  expect(formPath("instalments.0.amount_cents")).toBe("plan.rows.0.amount");
  expect(formPath("groom.cpf")).toBe("groom.cpf");
});
