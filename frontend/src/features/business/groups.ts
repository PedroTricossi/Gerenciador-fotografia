import type { Schemas } from "../../api/client";

export type InstalmentItem = Schemas["InstalmentListItem"];

export type InstalmentGroups = {
  late: InstalmentItem[];
  thisMonth: InstalmentItem[];
  upcoming: { month: string; items: InstalmentItem[] }[];
};

const unpaid = (item: InstalmentItem) => item.paid_on === null;

/** Splits the list into late, this month's and later months'. Keeps the incoming order. */
export function groupInstalments(items: InstalmentItem[], currentMonth: string): InstalmentGroups {
  const upcoming: InstalmentGroups["upcoming"] = [];
  for (const item of items) {
    if (!unpaid(item) || item.month <= currentMonth) continue;
    const last = upcoming[upcoming.length - 1];
    if (last?.month === item.month) last.items.push(item);
    else upcoming.push({ month: item.month, items: [item] });
  }
  return {
    late: items.filter((item) => unpaid(item) && item.month < currentMonth),
    thisMonth: items.filter((item) => item.month === currentMonth),
    upcoming,
  };
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "2026-10-17" to "17/10". */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
