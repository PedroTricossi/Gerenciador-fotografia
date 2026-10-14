import { HttpResponse } from "msw";
import type { ClientOut, ContractOut } from "../api/client";

export const IDS = {
  contract: "6f1c0a52-1111-4000-8000-000000000001",
  groom: "6f1c0a52-2222-4000-8000-000000000002",
  bride: "6f1c0a52-3333-4000-8000-000000000003",
};

const STAMP = "2026-10-13T12:00:00Z";

export function makeClient(overrides: Partial<ClientOut> = {}): ClientOut {
  return {
    id: IDS.groom,
    full_name: "Bruno Costa",
    cpf: "123.456.789-09",
    address: "Rua das Flores 100",
    created_at: STAMP,
    updated_at: STAMP,
    anonymised_at: null,
    ...overrides,
  };
}

export function makeContract(overrides: Partial<ContractOut> = {}): ContractOut {
  return {
    id: IDS.contract,
    groom: makeClient(),
    bride: makeClient({ id: IDS.bride, full_name: "Ana Lima", cpf: "987.654.321-00" }),
    couple_address: "Rua das Flores 100",
    event: {
      date: "2027-03-14",
      venue_name: "Igreja Matriz",
      venue_address: null,
      coverage_start: "16:00:00",
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
      total_cents: 140000,
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...overrides,
  };
}

export function page<T>(items: T[], nextCursor: string | null = null) {
  return { items, next_cursor: nextCursor };
}

export function problem(status: number, detail: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    {
      type: "about:blank",
      title: "Problem",
      status,
      detail,
      request_id: `req-${status}`,
      ...extra,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
