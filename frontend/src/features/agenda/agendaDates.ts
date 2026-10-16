import { formatIsoDate } from "../../domain/dates";

const WEEKDAYS = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

// Dates are "YYYY-MM-DD" strings, computed in UTC so daylight saving never moves a day.
export function toUtc(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** 0 for Sunday … 6 for Saturday. */
export function weekday(iso: string): number {
  return toUtc(iso).getUTCDay();
}

export function dayHeading(iso: string, today: string): string {
  if (iso === today) return "Hoje";
  if (iso === addDays(today, 1)) return "Amanhã";
  return `${WEEKDAYS[weekday(iso)] ?? ""}, ${formatIsoDate(iso)}`;
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** A calendar month; `month` counts from 0 (January). */
export type Month = { year: number; month: number };

export function monthOf(iso: string): Month {
  const date = toUtc(iso);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function shiftMonth(current: Month, delta: number): Month {
  const total = current.year * 12 + current.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function monthTitle(current: Month): string {
  return `${MONTHS[current.month] ?? ""} de ${current.year}`;
}

/** Every day of the whole weeks, Sunday first, that cover the month. */
export function monthGrid(current: Month): string[] {
  const first = fromUtc(new Date(Date.UTC(current.year, current.month, 1)));
  const last = fromUtc(new Date(Date.UTC(current.year, current.month + 1, 0)));
  const end = addDays(last, 6 - weekday(last));
  const days: string[] = [];
  for (let day = addDays(first, -weekday(first)); day <= end; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** "5 de outubro de 2026": the accessible name of a day in the grid. */
export function dayLabel(iso: string): string {
  const { year, month } = monthOf(iso);
  return `${Number(iso.slice(8, 10))} de ${MONTHS[month] ?? ""} de ${year}`;
}
