// Query keys live apart from the hooks so contracts and clients can invalidate
// each other's caches without importing one another.
export const contractKeys = {
  all: ["contracts"] as const,
  list: (includeDeleted: boolean) => ["contracts", { includeDeleted }] as const,
  ones: ["contract"] as const,
  one: (id: string) => ["contract", id] as const,
};

export const clientKeys = { all: ["clients"] as const };

export const serviceKeys = {
  all: ["services"] as const,
  list: (includeArchived: boolean) => ["services", { includeArchived }] as const,
};

// Under "contracts" so every change to a contract, its pre-wedding or a client
// (which all invalidate contractKeys.all) also refreshes the agenda.
export const agendaKeys = {
  range: (from: string, to: string) => ["contracts", "agenda", from, to] as const,
};

export const instalmentKeys = {
  all: ["instalments"] as const,
  list: (unpaidThrough: string | null) => ["instalments", { unpaidThrough }] as const,
};

export const expenseKeys = {
  all: ["expenses"] as const,
  entries: (month: string) => ["expenses", "entries", month] as const,
  types: (includeArchived: boolean) => ["expenses", "types", { includeArchived }] as const,
  events: ["expenses", "events"] as const,
  fixedCosts: ["expenses", "fixed-costs"] as const,
  fee: ["expenses", "second-photographer-fee"] as const,
};
