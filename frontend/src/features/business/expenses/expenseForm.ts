import type { ExpenseIn, ExpenseOut, ExpenseTypeOut } from "../../../api/client";
import { REQUIRED, amountError, textError } from "../../../domain/fieldRules";
import { formatKm, parseKm } from "../../../domain/expenses";
import { formatBrlAmount, parseBrl } from "../../../domain/money";

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
};

export type ExpenseField =
  | "spentOn"
  | "amount"
  | "typeId"
  | "description"
  | "event"
  | "transportKind"
  | "leftHomeAt"
  | "distance";
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
  };
}

export function isTransport(typeId: string, types: readonly ExpenseTypeOut[]): boolean {
  return types.find((type) => type.id === typeId)?.key === "transport";
}

/** Only a transport expense with an event carries a trip. */
export function hasTrip(values: ExpenseFormValues, types: readonly ExpenseTypeOut[]): boolean {
  return isTransport(values.typeId, types) && values.eventKey !== "";
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
    instalment_count: 1,
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
