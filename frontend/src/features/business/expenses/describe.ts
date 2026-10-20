import type { ExpenseEntryOut } from "../../../api/client";
import { formatKm, transportKindLabel } from "../../../domain/expenses";
import { coupleLabel } from "../../contracts/names";

export const DANGLING: Record<string, string> = {
  contract_deleted: "(contrato excluído)",
  prewedding_cancelled: "(pré-wedding cancelado)",
};

const EVENT_WORD = { wedding: "casamento", prewedding: "pré-wedding" } as const;

export function describe(entry: ExpenseEntryOut): string {
  const base = baseLabel(entry);
  const { instalment_number: number, instalment_count: count } = entry;
  return number !== null && count !== null && count > 1
    ? `${base} · parcela ${number}/${count}`
    : base;
}

function baseLabel(entry: ExpenseEntryOut): string {
  if (entry.transport_kind && entry.link_state) {
    const place =
      entry.link_state === "ok"
        ? coupleLabel({ full_name: entry.groom_name }, { full_name: entry.bride_name })
        : (DANGLING[entry.link_state] ?? "");
    const couple = coupleLabel({ full_name: entry.groom_name }, { full_name: entry.bride_name });
    // A dangling link has no event to name: the couple (when still known) and the warning say it.
    const where =
      entry.link_state === "ok"
        ? `${entry.event_kind ? `${EVENT_WORD[entry.event_kind]} ` : ""}${place}`
        : [entry.groom_name || entry.bride_name ? couple : null, place].filter(Boolean).join(" ");
    return [
      transportKindLabel(entry.transport_kind),
      where,
      entry.distance_tenths === null ? null : formatKm(entry.distance_tenths),
      entry.left_home_at ? `saí ${entry.left_home_at}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (entry.source === "second_photographer" && !entry.description) {
    // The read path sends the fee without a description; the wedding is what tells the rows apart.
    const couple = coupleLabel({ full_name: entry.groom_name }, { full_name: entry.bride_name });
    return `${entry.type_name} · ${couple}`;
  }
  return entry.description || entry.type_name;
}
