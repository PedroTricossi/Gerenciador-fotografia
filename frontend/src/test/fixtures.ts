import { HttpResponse, http } from "msw";
import type { AgendaEntryOut, ClientOut, ContractOut, ServiceOut } from "../api/client";

export const IDS = {
  contract: "6f1c0a52-1111-4000-8000-000000000001",
  groom: "6f1c0a52-2222-4000-8000-000000000002",
  bride: "6f1c0a52-3333-4000-8000-000000000003",
  serviceCeremony: "6f1c0a52-4444-4000-8000-000000000004",
  serviceSecond: "6f1c0a52-5555-4000-8000-000000000005",
  servicePrewedding: "6f1c0a52-6666-4000-8000-000000000006",
  serviceArchived: "6f1c0a52-7777-4000-8000-000000000007",
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

export function makeService(overrides: Partial<ServiceOut> = {}): ServiceOut {
  return {
    id: IDS.serviceCeremony,
    name: "Cobertura da cerimônia na igreja",
    default_price_cents: 120000,
    is_prewedding: false,
    archived_at: null,
    version: 1,
    ...overrides,
  };
}

/** Sorted as the server sorts: by name, ignoring case and accents. */
export const SERVICES: ServiceOut[] = [
  makeService({
    id: IDS.serviceArchived,
    name: "Álbum antigo",
    default_price_cents: 30000,
    archived_at: STAMP,
    version: 2,
  }),
  makeService(),
  makeService({
    id: IDS.serviceSecond,
    name: "Diária segundo fotógrafo",
    default_price_cents: 50000,
  }),
  makeService({
    id: IDS.servicePrewedding,
    name: "Ensaio de pré-wedding",
    default_price_cents: 80000,
    is_prewedding: true,
  }),
];

export function servicesHandler(services: ServiceOut[] = SERVICES) {
  return http.get("/api/v1/services", ({ request }) => {
    const all = new URL(request.url).searchParams.get("include_archived") === "true";
    return HttpResponse.json(all ? services : services.filter((s) => s.archived_at === null));
  });
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
        {
          service_id: IDS.serviceCeremony,
          description: "Cobertura da cerimônia na igreja",
          amount_cents: 120000,
        },
        {
          service_id: IDS.serviceSecond,
          description: "Diária segundo fotógrafo",
          amount_cents: 50000,
        },
      ],
      pix_discount_cents: 30000,
      total_cents: 140000,
    },
    signing: { city: "Curitiba", date: "2026-10-13" },
    instalments: [{ number: 1, month: "2026-10", amount_cents: 140000, paid_on: null }],
    plan_needs_review: false,
    has_prewedding: false,
    prewedding: null,
    version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
    ...overrides,
  };
}

export function makeAgendaEntry(overrides: Partial<AgendaEntryOut> = {}): AgendaEntryOut {
  return {
    contract_id: IDS.contract,
    kind: "wedding",
    date: "2026-10-24",
    start_time: "16:00:00",
    venue_name: "Igreja Matriz",
    groom: { full_name: "João da Silva" },
    bride: { full_name: "Ana Lima" },
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
