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
