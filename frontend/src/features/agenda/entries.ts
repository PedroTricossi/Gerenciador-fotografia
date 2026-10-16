import type { AgendaEntryOut } from "../../api/client";
import { coupleLabel } from "../contracts/names";

export function kindLabel(kind: AgendaEntryOut["kind"]): string {
  return kind === "wedding" ? "Casamento" : "Pré-wedding";
}

/** "16:00:00" → "16:00"; no time → "—". */
export function timeLabel(time: string | null): string {
  return time ? time.slice(0, 5) : "—";
}

/** What a screen reader announces for an entry's link. */
export function entryLabel(entry: AgendaEntryOut): string {
  const time = entry.start_time ? `às ${timeLabel(entry.start_time)}` : "sem horário";
  return `${coupleLabel(entry.groom, entry.bride)}, ${kindLabel(entry.kind)}, ${time}, ${entry.venue_name}`;
}

export function entryKey(entry: AgendaEntryOut): string {
  return `${entry.contract_id}:${entry.kind}`;
}

/** Entries grouped by date, keeping the server's order within and between days. */
export function groupByDate(entries: readonly AgendaEntryOut[]): [string, AgendaEntryOut[]][] {
  const groups = new Map<string, AgendaEntryOut[]>();
  for (const entry of entries) {
    const group = groups.get(entry.date);
    if (group) group.push(entry);
    else groups.set(entry.date, [entry]);
  }
  return [...groups];
}
