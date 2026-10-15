import type { ServiceOut } from "../../api/client";

export type ServiceOption = { id: string; label: string; defaultPriceCents: number };
export type SavedItem = { service_id: string; description: string };

/**
 * Active services, plus archived ones this contract already uses. A service already on
 * the contract is labelled with the contract's own wording, so the form matches the PDF.
 */
export function serviceOptions(services: ServiceOut[], savedItems: SavedItem[]): ServiceOption[] {
  const saved = new Map(savedItems.map((item) => [item.service_id, item.description]));
  return services
    .filter((service) => service.archived_at === null || saved.has(service.id))
    .map((service) => {
      const label = saved.get(service.id) ?? service.name;
      return {
        id: service.id,
        label: service.archived_at === null ? label : `${label} (arquivado)`,
        defaultPriceCents: service.default_price_cents,
      };
    });
}

/** Every service marked as a pre-wedding shoot, archived or not. */
export function preweddingServiceIds(services: ServiceOut[]): Set<string> {
  return new Set(services.filter((service) => service.is_prewedding).map((service) => service.id));
}
