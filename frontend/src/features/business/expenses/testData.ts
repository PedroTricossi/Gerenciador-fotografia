import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";

export const TYPE_IDS = {
  assinatura: "6f1c0a52-9999-4000-8000-000000000001",
  transport: "6f1c0a52-9999-4000-8000-00000000000a",
  second: "6f1c0a52-9999-4000-8000-00000000000b",
  cafe: "6f1c0a52-9999-4000-8000-000000000009",
};

export const makeType = (
  id: string,
  name: string,
  key: string | null = null,
  archived_at: string | null = null,
) => ({ id, name, key, archived_at, version: 1 });

export const baseTypes = () => [
  makeType(TYPE_IDS.assinatura, "Assinatura"),
  makeType(TYPE_IDS.transport, "Transporte", "transport"),
  makeType(TYPE_IDS.second, "2º fotógrafo", "second_photographer"),
  makeType(TYPE_IDS.cafe, "Café"),
];

export const makeCost = (overrides: Record<string, unknown> = {}) => ({
  id: "fc-adobe",
  name: "Adobe",
  type_id: TYPE_IDS.assinatura,
  type_name: "Assinatura",
  day_of_month: 3,
  start_month: "2026-01",
  end_month: null,
  prices: [{ from_month: "2026-01", amount_cents: 12400 }],
  version: 4,
  ...overrides,
});

/** Serves the read endpoints the Despesas tab loads; the lists are passed by reference. */
export function serveExpenses({
  costs = [makeCost()],
  types = baseTypes(),
  fee = [{ from_month: "2026-01", amount_cents: 50000 }],
  entries = [] as unknown[],
} = {}) {
  server.use(
    http.get("/api/v1/expense-entries", () => HttpResponse.json({ entries, total_cents: 0 })),
    http.get("/api/v1/fixed-costs", () => HttpResponse.json(costs)),
    http.get("/api/v1/second-photographer-fee", () => HttpResponse.json({ prices: fee })),
    http.get("/api/v1/expense-types", () => HttpResponse.json(types)),
  );
}
