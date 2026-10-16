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
