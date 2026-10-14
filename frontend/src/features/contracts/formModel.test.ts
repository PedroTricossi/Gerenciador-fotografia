import { makeContract } from "../../test/fixtures";
import {
  type ContractFormValues,
  defaultValues,
  formTotal,
  fromContract,
  isFormField,
  moneyText,
  toRequest,
  validate,
} from "./formModel";

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
        { description: "Cobertura da cerimônia na igreja", amount_cents: "1.200,00" },
        { description: "Diária segundo fotógrafo", amount_cents: "500" },
      ],
      pix_discount_cents: "300",
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
  };
}

test("defaults: one empty item, two photographers, Curitiba, signed today", () => {
  const values = defaultValues("2026-10-14");
  expect(values.payment.items).toEqual([{ description: "", amount_cents: "" }]);
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
        { description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
        { description: "Diária segundo fotógrafo", amount_cents: 50000 },
      ],
      pix_discount_cents: 30000,
    },
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
        { description: "Cobertura da cerimônia na igreja", amount_cents: 120000 },
        { description: "Diária segundo fotógrafo", amount_cents: 50000 },
      ],
      pix_discount_cents: 30000,
    },
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
    "payment.items.0.description",
    "payment.items.0.amount_cents",
  ]) {
    expect(errors[path]).toBe("campo obrigatório");
  }
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
  ["payment.items.1.description", 2, true],
  ["payment.items.2.description", 2, false],
  ["payment.items", 2, false],
  ["payment", 1, false],
  ["*", 1, false],
  ["", 1, false],
])("isFormField(%j, %i) is %s", (path, count, expected) => {
  expect(isFormField(path, count)).toBe(expected);
});
