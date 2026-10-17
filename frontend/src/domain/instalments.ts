/** Payment-plan rules; they mirror the backend's `domain/instalments.py`. */

export const MAX_INSTALMENTS = 4;

/** `floor(total / count)` each, with the leftover centavos on the last one. */
export function splitEqually(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const amounts = Array.from({ length: count }, () => base);
  amounts[count - 1]! += total - base * count;
  return amounts;
}

/**
 * Spreads a new total equally over the unpaid instalments, leaving the paid ones alone.
 * Returns null where the server would refuse: all paid, or an unpaid share left at zero or less.
 */
export function spreadChange(
  amounts: readonly number[],
  paid: readonly boolean[],
  newTotal: number,
): number[] | null {
  const sum = amounts.reduce((acc, amount) => acc + amount, 0);
  if (newTotal === sum) return [...amounts];
  const unpaid = paid.flatMap((isPaid, index) => (isPaid ? [] : [index]));
  if (unpaid.length === 0) return null;
  const paidSum = amounts.reduce((acc, amount, index) => acc + (paid[index] ? amount : 0), 0);
  const shares = splitEqually(newTotal - paidSum, unpaid.length);
  if (Math.min(...shares) <= 0) return null;
  const result = [...amounts];
  unpaid.forEach((position, index) => (result[position] = shares[index]!));
  return result;
}

/** "YYYY-MM" plus `n` months, across year ends. */
export function addMonths(month: string, n: number): string {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function currentMonth(today: Date = new Date()): string {
  return `${String(today.getFullYear()).padStart(4, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

/** True from the month's last day minus 6 through its last day. */
export function inReminderWindow(today: Date = new Date()): boolean {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return today.getDate() > lastDay - 7;
}
