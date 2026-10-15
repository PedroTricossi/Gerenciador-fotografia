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
