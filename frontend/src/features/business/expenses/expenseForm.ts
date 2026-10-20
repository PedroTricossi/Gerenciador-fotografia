import type { ExpenseIn, ExpenseOut, ExpenseTypeOut } from "../../../api/client";
import { REQUIRED, amountError, textError } from "../../../domain/fieldRules";
import { formatKm, parseKm } from "../../../domain/expenses";
import { splitEqually } from "../../../domain/instalments";
import { formatBrl, formatBrlAmount, parseBrl } from "../../../domain/money";

// Mirrors MAX_EXPENSE_INSTALMENTS in backend/src/gerenciador/domain/expenses.py; keep them equal.
export const MAX_EXPENSE_INSTALMENTS = 24;

export type ExpenseFormValues = {
  spentOn: string;
  amount: string;
  typeId: string;
  description: string;
  /** "" for none, else "<contract_id>:<event_kind>". */
  eventKey: string;
  transportKind: string;
  leftHomeAt: string;
  distance: string;
  /** "Parcelado": the amount is the purchase total, paid in `instalmentCount` parts. */
  split: boolean;
  instalmentCount: string;
};

export type ExpenseField =
  | "spentOn"
  | "amount"
  | "typeId"
  | "description"
  | "event"
  | "transportKind"
  | "leftHomeAt"
  | "distance"
  | "instalmentCount";
export type ExpenseErrors = Partial<Record<ExpenseField, string>>;

type TripKind = "wedding" | "prewedding";

export function emptyExpenseValues(today: string): ExpenseFormValues {
  return {
    spentOn: today,
    amount: "",
    typeId: "",
    description: "",
    eventKey: "",
    transportKind: "",
    leftHomeAt: "",
    distance: "",
    split: false,
    instalmentCount: "",
  };
}

export function eventKey(contractId: string, kind: string): string {
  return `${contractId}:${kind}`;
}

function splitEventKey(key: string): { contract_id: string; event_kind: TripKind } {
  const at = key.lastIndexOf(":");
  return { contract_id: key.slice(0, at), event_kind: key.slice(at + 1) as TripKind };
}

export function fromExpense(expense: ExpenseOut): ExpenseFormValues {
  const trip = expense.trip;
  return {
    spentOn: expense.spent_on,
    amount: formatBrlAmount(expense.amount_cents),
    typeId: expense.type_id,
    description: expense.description ?? "",
    eventKey: trip ? eventKey(trip.contract_id, trip.event_kind) : "",
    transportKind: trip?.transport_kind ?? "",
    leftHomeAt: trip?.left_home_at.slice(0, 5) ?? "",
    distance: trip ? formatKm(trip.distance_tenths).replace(" km", "") : "",
    split: expense.instalment_count > 1,
    instalmentCount: expense.instalment_count > 1 ? String(expense.instalment_count) : "",
  };
}

export function isTransport(typeId: string, types: readonly ExpenseTypeOut[]): boolean {
  return types.find((type) => type.id === typeId)?.key === "transport";
}

/** Only a transport expense with an event carries a trip. */
export function hasTrip(values: ExpenseFormValues, types: readonly ExpenseTypeOut[]): boolean {
  return isTransport(values.typeId, types) && values.eventKey !== "";
}

/** The count as a whole number from 2 to 24, else null. */
function parseInstalmentCount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return count >= 2 && count <= MAX_EXPENSE_INSTALMENTS ? count : null;
}

/** "3x de R$ 333,33 (última R$ 333,34)"; null until the amount and count are valid. */
export function instalmentPreview(amount: string, count: string): string | null {
  const total = parseBrl(amount);
  const parts = parseInstalmentCount(count);
  if (total === null || parts === null || total < parts) return null;
  const amounts = splitEqually(total, parts);
  const first = amounts[0]!;
  const last = amounts[parts - 1]!;
  const each = `${parts}x de ${formatBrl(first)}`;
  return last === first ? each : `${each} (última ${formatBrl(last)})`;
}

export function validateExpense(
  values: ExpenseFormValues,
  types: readonly ExpenseTypeOut[],
): ExpenseErrors {
  const errors: ExpenseErrors = {};
  if (values.spentOn === "") errors.spentOn = REQUIRED;
  const amount = amountError(values.amount, true);
  if (amount) errors.amount = amount;
  if (values.typeId === "") errors.typeId = REQUIRED;
  const description = textError(values.description, 200, false);
  if (description) errors.description = description;
  if (values.split) {
    if (values.instalmentCount.trim() === "") errors.instalmentCount = REQUIRED;
    else if (parseInstalmentCount(values.instalmentCount) === null)
      errors.instalmentCount = `Use de 2 a ${MAX_EXPENSE_INSTALMENTS} parcelas.`;
  }
  if (hasTrip(values, types)) {
    if (values.transportKind === "") errors.transportKind = REQUIRED;
    if (values.leftHomeAt === "") errors.leftHomeAt = REQUIRED;
    if (values.distance.trim() === "") errors.distance = REQUIRED;
    else if (parseKm(values.distance) === null) errors.distance = "distância inválida";
  }
  return errors;
}

export function toRequest(values: ExpenseFormValues, types: readonly ExpenseTypeOut[]): ExpenseIn {
  const description = values.description.trim();
  return {
    spent_on: values.spentOn,
    amount_cents: parseBrl(values.amount) ?? Number.NaN,
    type_id: values.typeId,
    description: description === "" ? null : description,
    trip: hasTrip(values, types)
      ? {
          ...splitEventKey(values.eventKey),
          transport_kind: values.transportKind as NonNullable<ExpenseIn["trip"]>["transport_kind"],
          left_home_at: values.leftHomeAt,
          distance_tenths: parseKm(values.distance) ?? Number.NaN,
        }
      : null,
    instalment_count: values.split
      ? (parseInstalmentCount(values.instalmentCount) ?? Number.NaN)
      : 1,
  };
}

/** Where a server 422 field path lands on the form; null means no field of ours. */
export function fieldFor(path: string): ExpenseField | null {
  switch (path) {
    case "spent_on":
      return "spentOn";
    case "amount_cents":
      return "amount";
    case "type_id":
      return "typeId";
    case "description":
      return "description";
    case "instalment_count":
      return "instalmentCount";
    case "trip.contract_id":
    case "trip.event_kind":
      return "event";
    case "trip.transport_kind":
      return "transportKind";
    case "trip.left_home_at":
      return "leftHomeAt";
    case "trip.distance_tenths":
      return "distance";
    default:
      return null;
  }
}
