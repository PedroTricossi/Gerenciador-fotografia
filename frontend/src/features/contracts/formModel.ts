import type { ContractCreate, ContractOut } from "../../api/client";
import { discountError, totalCents } from "../../domain/contract";
import { cpfDigits, formatCpf } from "../../domain/cpf";
import { REQUIRED, amountError, textError } from "../../domain/fieldRules";
import {
  MAX_INSTALMENTS,
  addMonths,
  currentMonth,
  spreadChange,
  splitEqually,
} from "../../domain/instalments";
import { formatBrlAmount, parseBrl } from "../../domain/money";
import {
  type PreweddingValues,
  emptyPrewedding,
  isBlankPrewedding,
  toPreweddingRequest,
  validatePrewedding,
} from "./preweddingForm";

export type ItemValues = { service_id: string; amount_cents: string };

export type PlanRow = { month: string; amount: string; paidOn: string | null };
export type PlanValues = { mode: "single" | "split"; rows: PlanRow[] };

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
  plan: PlanValues;
  signing: { city: string; date: string };
  prewedding: PreweddingValues;
};

export const MAX_ITEMS = 20;

export function emptyItem(): ItemValues {
  return { service_id: "", amount_cents: "" };
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
    plan: { mode: "single", rows: [{ month: today.slice(0, 7), amount: "", paidOn: null }] },
    signing: { city: "Curitiba", date: today },
    prewedding: emptyPrewedding(),
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
        service_id: item.service_id,
        amount_cents: formatBrlAmount(item.amount_cents),
      })),
      pix_discount_cents:
        contract.payment.pix_discount_cents === null
          ? ""
          : formatBrlAmount(contract.payment.pix_discount_cents),
    },
    plan: {
      mode: contract.instalments.length > 1 ? "split" : "single",
      rows: contract.instalments.map((instalment) => ({
        month: instalment.month,
        amount: formatBrlAmount(instalment.amount_cents),
        paidOn: instalment.paid_on,
      })),
    },
    signing: { city: contract.signing.city, date: contract.signing.date },
    prewedding: emptyPrewedding(),
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
        service_id: item.service_id,
        amount_cents: parseBrl(item.amount_cents) ?? Number.NaN,
      })),
      pix_discount_cents: parseBrl(values.payment.pix_discount_cents),
    },
    instalments: values.plan.rows.map((row) => ({
      month: row.month,
      amount_cents: parseBrl(row.amount) ?? Number.NaN,
    })),
    signing: { city: values.signing.city.trim(), date: values.signing.date },
    ...(isBlankPrewedding(values.prewedding)
      ? {}
      : { prewedding: toPreweddingRequest(values.prewedding) }),
  };
}

function integerInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const number = Number(value);
  return number >= min && number <= max;
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

  const seen = new Set<string>();
  values.payment.items.forEach((item, index) => {
    if (item.service_id === "") {
      errors[`payment.items.${index}.service_id`] = "selecione um serviço";
    } else if (seen.has(item.service_id)) {
      errors[`payment.items.${index}.service_id`] = "serviço repetido no contrato";
    }
    seen.add(item.service_id);
    check(`payment.items.${index}.amount_cents`, amountError(item.amount_cents, true));
  });
  const discountText = amountError(values.payment.pix_discount_cents, false);
  check(
    "payment.pix_discount_cents",
    discountText ?? discountError(amounts(values), parseBrl(values.payment.pix_discount_cents)),
  );

  Object.assign(errors, validatePlan(values));

  check("signing.city", textError(values.signing.city, 100, true));
  check("signing.date", values.signing.date === "" ? REQUIRED : null);
  if (!isBlankPrewedding(values.prewedding)) {
    for (const [key, message] of Object.entries(validatePrewedding(values.prewedding))) {
      errors[`prewedding.${key}`] = message;
    }
  }
  return errors;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Plan errors, keyed by form path; `plan.sum` is the whole-plan message. */
function validatePlan(values: ContractFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const { rows } = values.plan;
  rows.forEach((row, index) => {
    if (row.month === "") errors[`plan.rows.${index}.month`] = REQUIRED;
    else if (!MONTH.test(row.month)) errors[`plan.rows.${index}.month`] = "mês inválido";
    else if (index > 0 && row.month <= rows[index - 1]!.month) {
      errors[`plan.rows.${index}.month`] = "os meses das parcelas devem ser crescentes";
    }
    const amount = amountError(row.amount, true);
    if (amount) errors[`plan.rows.${index}.amount`] = amount;
  });
  const total = formTotal(values);
  const cents = rows.map((row) => parseBrl(row.amount));
  if (
    total !== null &&
    cents.every((value) => value !== null && !Number.isNaN(value)) &&
    cents.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== total
  ) {
    errors["plan.sum"] = PLAN_SUM_MESSAGE;
  }
  return errors;
}

export const PLAN_SUM_MESSAGE = "a soma das parcelas deve ser igual ao total";

/** Sum of the plan's amounts, or null while one of them is not a valid amount. */
export function planSum(plan: PlanValues): number | null {
  let sum = 0;
  for (const row of plan.rows) {
    const cents = parseBrl(row.amount);
    if (cents === null || Number.isNaN(cents)) return null;
    sum += cents;
  }
  return sum;
}

/** The plan with `count` rows: drops unpaid rows from the end, or adds rows in the following months. */
export function resizePlan(rows: PlanRow[], count: number): PlanRow[] {
  const next = [...rows];
  while (next.length > count && next[next.length - 1]!.paidOn === null) next.pop();
  while (next.length < Math.min(count, MAX_INSTALMENTS)) {
    const last = next[next.length - 1];
    // An empty plan (a contract with no instalments) starts from the current month.
    next.push({
      month: last ? addMonths(last.month, 1) : currentMonth(),
      amount: "",
      paidOn: null,
    });
  }
  return next;
}

/** Splits what the paid rows leave of `total` equally over the unpaid rows; null when it cannot. */
export function splitUnpaid(rows: PlanRow[], total: number): PlanRow[] | null {
  const unpaid = rows.flatMap((row, index) => (row.paidOn === null ? [index] : []));
  const paidSum = rows.reduce(
    (sum, row) => sum + (row.paidOn === null ? 0 : (parseBrl(row.amount) ?? 0)),
    0,
  );
  if (unpaid.length === 0) return null;
  const shares = splitEqually(total - paidSum, unpaid.length);
  if (Math.min(...shares) <= 0) return null;
  const next = rows.map((row) => ({ ...row }));
  unpaid.forEach((position, index) => (next[position]!.amount = formatBrlAmount(shares[index]!)));
  return next;
}

/**
 * The plan after the total changed. By default the unpaid rows are split equally (a new contract
 * whose amounts were never typed). With `keepShape` (an existing plan) the difference is added
 * equally to the unpaid rows, exactly as the server does, so the plan keeps its shape.
 * Paid rows always stay.
 */
export function respreadForTotal(
  plan: PlanValues,
  total: number,
  keepShape = false,
): PlanRow[] | null {
  if (planSum(plan) === total) return plan.rows;
  const amounts = plan.rows.map((row) => parseBrl(row.amount));
  if (keepShape && amounts.every((cents) => cents !== null && !Number.isNaN(cents))) {
    const spread = spreadChange(
      amounts as number[],
      plan.rows.map((row) => row.paidOn !== null),
      total,
    );
    return spread && plan.rows.map((row, i) => ({ ...row, amount: formatBrlAmount(spread[i]!) }));
  }
  return splitUnpaid(plan.rows, total);
}

/**
 * True when the form's plan is exactly what the server would make of the new total on its own,
 * so a save can leave the plan out and let the server spread it.
 */
export function planFollowsTotal(contract: ContractOut, values: ContractFormValues): boolean {
  const total = formTotal(values);
  if (total === null || Number.isNaN(total)) return false;
  const stored = contract.instalments;
  const spread = spreadChange(
    stored.map((row) => row.amount_cents),
    stored.map((row) => row.paid_on !== null),
    total,
  );
  const sent = toRequest(values).instalments;
  return (
    spread !== null &&
    sent.length === stored.length &&
    sent.every((row, i) => row.month === stored[i]!.month && row.amount_cents === spread[i])
  );
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
  "prewedding.date",
  "prewedding.venue_name",
  "prewedding.venue_address",
  "prewedding.start_time",
]);
const ITEM_FIELD = /^payment\.items\.(\d+)\.(service_id|amount_cents)$/;
const INSTALMENT_FIELD = /^instalments\.(\d+)\.(month|amount_cents)$/;

export function isFormField(path: string, itemCount: number, rowCount = 0): boolean {
  if (FIXED_FIELDS.has(path) || path === "instalments") return true;
  const match = ITEM_FIELD.exec(path);
  if (match !== null) return Number(match[1]) < itemCount;
  const instalment = INSTALMENT_FIELD.exec(path);
  return instalment !== null && Number(instalment[1]) < rowCount;
}

/** Where the form shows a server error: the plan's fields have names of their own. */
export function formPath(serverPath: string): string {
  if (serverPath === "instalments") return "plan.sum";
  const match = INSTALMENT_FIELD.exec(serverPath);
  if (match === null) return serverPath;
  return `plan.rows.${match[1]}.${match[2] === "month" ? "month" : "amount"}`;
}
