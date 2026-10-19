import type { ExpenseEventOut, ExpenseTypeOut } from "../../../api/client";
import { fromExpense, toRequest, type ExpenseFormValues } from "./expenseForm";

const type = (key: string | null, id: string): ExpenseTypeOut => ({
  id,
  name: key ?? "Café",
  key,
  archived_at: null,
  version: 1,
});
const TYPES = [type(null, "t-cafe"), type("transport", "t-transport")];
const CONTRACT = "6f1c0a52-1111-4000-8000-000000000001";

const base: ExpenseFormValues = {
  spentOn: "2026-10-11",
  amount: "86,00",
  typeId: "t-cafe",
  description: "",
  eventKey: "",
  transportKind: "",
  leftHomeAt: "",
  distance: "",
};

test("a plain expense has no trip and the amount in cents", () => {
  expect(toRequest(base, TYPES)).toEqual({
    spent_on: "2026-10-11",
    amount_cents: 8600,
    type_id: "t-cafe",
    description: null,
    trip: null,
  });
});

test("a transport expense with an event carries the whole trip", () => {
  const values = {
    ...base,
    typeId: "t-transport",
    description: " Uber ",
    eventKey: `${CONTRACT}:wedding`,
    transportKind: "ride_app",
    leftHomeAt: "13:30",
    distance: "32",
  };
  expect(toRequest(values, TYPES)).toEqual({
    spent_on: "2026-10-11",
    amount_cents: 8600,
    type_id: "t-transport",
    description: "Uber",
    trip: {
      contract_id: CONTRACT,
      event_kind: "wedding",
      transport_kind: "ride_app",
      left_home_at: "13:30",
      distance_tenths: 320,
    },
  });
});

test("a transport expense with no event has no trip", () => {
  const values = { ...base, typeId: "t-transport", transportKind: "car", distance: "10" };
  expect(toRequest(values, TYPES).trip).toBeNull();
});

test("fromExpense fills every field from a stored expense", () => {
  const expense = {
    id: "e1",
    spent_on: "2026-10-11",
    amount_cents: 8650,
    type_id: "t-transport",
    description: null,
    trip: {
      contract_id: CONTRACT,
      event_kind: "prewedding" as ExpenseEventOut["event_kind"],
      transport_kind: "car",
      left_home_at: "13:30:00",
      distance_tenths: 325,
    },
    version: 2,
    created_at: "2026-10-11T10:00:00Z",
  };
  expect(fromExpense(expense)).toEqual({
    spentOn: "2026-10-11",
    amount: "86,50",
    typeId: "t-transport",
    description: "",
    eventKey: `${CONTRACT}:prewedding`,
    transportKind: "car",
    leftHomeAt: "13:30",
    distance: "32,5",
  });
  expect(fromExpense({ ...expense, trip: null }).eventKey).toBe("");
});
