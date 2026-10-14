import type { ContractCreate, ContractOut } from "../../api/client";
import { discountError, totalCents } from "../../domain/contract";
import { cpfDigits, formatCpf } from "../../domain/cpf";
import { MAX_CENTS, formatBrlAmount, parseBrl } from "../../domain/money";

export type ItemValues = { description: string; amount_cents: string };

export type ContractFormValues = {
  groom: { full_name: string; cpf: string };
  bride: { full_name: string; cpf: string };
  couple_address: string;
  event: {
    date: string;
    venue_name: string;
    venue_address: string;
    coverage_start: string;
    coverage_end: string;
    hours_contracted: string;
  };
  photographer_count: string;
  payment: { items: ItemValues[]; pix_discount_cents: string };
  signing: { city: string; date: string };
};

export const MAX_ITEMS = 20;

const REQUIRED = "campo obrigatório";
// Unicode category Cc, as the backend refuses it.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export function emptyItem(): ItemValues {
  return { description: "", amount_cents: "" };
}

export function defaultValues(today: string): ContractFormValues {
  return {
    groom: { full_name: "", cpf: "" },
    bride: { full_name: "", cpf: "" },
    couple_address: "",
    event: {
      date: "",
      venue_name: "",
      venue_address: "",
      coverage_start: "",
      coverage_end: "",
      hours_contracted: "",
    },
    photographer_count: "2",
    payment: { items: [emptyItem()], pix_discount_cents: "" },
    signing: { city: "Curitiba", date: today },
  };
}

const time = (value: string | null) => (value ? value.slice(0, 5) : "");

export function fromContract(contract: ContractOut): ContractFormValues {
  return {
    groom: {
      full_name: contract.groom.full_name ?? "",
      cpf: formatCpf(contract.groom.cpf ?? ""),
    },
    bride: {
      full_name: contract.bride.full_name ?? "",
      cpf: formatCpf(contract.bride.cpf ?? ""),
    },
    couple_address: contract.couple_address ?? "",
    event: {
      date: contract.event.date,
      venue_name: contract.event.venue_name,
      venue_address: contract.event.venue_address ?? "",
      coverage_start: time(contract.event.coverage_start),
      coverage_end: time(contract.event.coverage_end),
      hours_contracted:
        contract.event.hours_contracted === null ? "" : String(contract.event.hours_contracted),
    },
    photographer_count: String(contract.photographer_count),
    payment: {
      items: contract.payment.items.map((item) => ({
        description: item.description,
        amount_cents: formatBrlAmount(item.amount_cents),
      })),
      pix_discount_cents:
        contract.payment.pix_discount_cents === null
          ? ""
          : formatBrlAmount(contract.payment.pix_discount_cents),
    },
    signing: { city: contract.signing.city, date: contract.signing.date },
  };
}

const optional = (value: string) => (value.trim() === "" ? null : value.trim());
const cpf = (value: string) => cpfDigits(value) ?? value.trim();

export function toRequest(values: ContractFormValues): ContractCreate {
  return {
    groom: { full_name: values.groom.full_name.trim(), cpf: cpf(values.groom.cpf) },
    bride: { full_name: values.bride.full_name.trim(), cpf: cpf(values.bride.cpf) },
    couple_address: values.couple_address.trim(),
    event: {
      date: values.event.date,
      venue_name: values.event.venue_name.trim(),
      venue_address: optional(values.event.venue_address),
      coverage_start: optional(values.event.coverage_start),
      coverage_end: optional(values.event.coverage_end),
      hours_contracted:
        optional(values.event.hours_contracted) === null
          ? null
          : Number(values.event.hours_contracted),
    },
    photographer_count: Number(values.photographer_count),
    payment: {
      items: values.payment.items.map((item) => ({
        description: item.description.trim(),
        amount_cents: parseBrl(item.amount_cents) ?? Number.NaN,
      })),
      pix_discount_cents: parseBrl(values.payment.pix_discount_cents),
    },
    signing: { city: values.signing.city.trim(), date: values.signing.date },
  };
}

function textError(value: string, max: number, required: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return required ? REQUIRED : null;
  // The API strips whitespace before refusing control characters, so check the trimmed text.
  if (CONTROL.test(trimmed)) return "não pode conter caracteres de controle";
  // Python counts code points, so an astral character is one character here too.
  if ([...trimmed].length > max) return `máximo de ${max} caracteres`;
  return null;
}

function integerInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const number = Number(value);
  return number >= min && number <= max;
}

function amountError(text: string, required: boolean): string | null {
  const cents = parseBrl(text);
  if (cents === null) return required ? REQUIRED : null;
  if (Number.isNaN(cents)) return "valor inválido";
  if (cents <= 0) return "o valor deve ser maior que zero";
  if (cents > MAX_CENTS) return "valor máximo R$ 1.000.000,00";
  return null;
}

const amounts = (values: ContractFormValues) =>
  values.payment.items.map((item) => parseBrl(item.amount_cents));

export function validate(values: ContractFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const check = (path: string, message: string | null) => {
    if (message) errors[path] = message;
  };

  for (const role of ["groom", "bride"] as const) {
    check(`${role}.full_name`, textError(values[role].full_name, 200, true));
    const typed = values[role].cpf.trim();
    check(
      `${role}.cpf`,
      typed === "" ? REQUIRED : cpfDigits(typed) === null ? "CPF inválido" : null,
    );
  }
  const groomCpf = cpfDigits(values.groom.cpf);
  if (groomCpf !== null && groomCpf === cpfDigits(values.bride.cpf)) {
    errors["bride.cpf"] = "os CPFs dos contratantes devem ser diferentes";
  }

  check("couple_address", textError(values.couple_address, 300, true));
  check("event.date", values.event.date === "" ? REQUIRED : null);
  check("event.venue_name", textError(values.event.venue_name, 200, true));
  check("event.venue_address", textError(values.event.venue_address, 300, false));
  if (
    values.event.hours_contracted.trim() !== "" &&
    !integerInRange(values.event.hours_contracted, 1, 24)
  ) {
    errors["event.hours_contracted"] = "informe de 1 a 24 horas";
  }
  if (!integerInRange(values.photographer_count, 1, 10)) {
    errors.photographer_count = "informe de 1 a 10 fotógrafos";
  }

  values.payment.items.forEach((item, index) => {
    check(`payment.items.${index}.description`, textError(item.description, 200, true));
    check(`payment.items.${index}.amount_cents`, amountError(item.amount_cents, true));
  });
  const discountText = amountError(values.payment.pix_discount_cents, false);
  check(
    "payment.pix_discount_cents",
    discountText ?? discountError(amounts(values), parseBrl(values.payment.pix_discount_cents)),
  );

  check("signing.city", textError(values.signing.city, 100, true));
  check("signing.date", values.signing.date === "" ? REQUIRED : null);
  return errors;
}

export function formTotal(values: ContractFormValues): number | null {
  const discount = parseBrl(values.payment.pix_discount_cents);
  return totalCents(amounts(values), Number.isNaN(discount) ? null : discount);
}

export function moneyText(text: string): string {
  const cents = parseBrl(text);
  return cents !== null && Number.isInteger(cents) && cents > 0 ? formatBrlAmount(cents) : text;
}

const FIXED_FIELDS = new Set([
  "groom.full_name",
  "groom.cpf",
  "bride.full_name",
  "bride.cpf",
  "couple_address",
  "event.date",
  "event.venue_name",
  "event.venue_address",
  "event.coverage_start",
  "event.coverage_end",
  "event.hours_contracted",
  "photographer_count",
  "payment.pix_discount_cents",
  "signing.city",
  "signing.date",
]);
const ITEM_FIELD = /^payment\.items\.(\d+)\.(description|amount_cents)$/;

export function isFormField(path: string, itemCount: number): boolean {
  if (FIXED_FIELDS.has(path)) return true;
  const match = ITEM_FIELD.exec(path);
  return match !== null && Number(match[1]) < itemCount;
}
