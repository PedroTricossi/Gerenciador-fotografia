import { formatBrl } from "../../../domain/money";

/** Percent x 10 of `part` in `whole`, rounded half-up in integers; mirrors the backend's `share_tenths`. */
export function shareTenths(part: number, whole: number): number | null {
  if (whole <= 0 || part > whole) return null;
  return Math.floor((part * 2000 + whole) / (2 * whole));
}

/** "12,6%" for 126 tenths. */
export function formatTenths(tenths: number): string {
  return `${Math.floor(tenths / 10)},${tenths % 10}%`;
}

/** Like `formatBrl`, with a real minus sign for negative amounts ("−R$ 200,00"). */
export function formatSigned(cents: number): string {
  return cents < 0 ? `−${formatBrl(-cents)}` : formatBrl(cents);
}
