import type { FixedCostOut } from "../../../api/client";
import { priceInForce } from "../../../domain/expenses";
import { formatBrl } from "../../../domain/money";
import { monthName } from "../groups";

/**
 * The price a fixed cost has in `month`. A cost that starts later has no price yet, so it shows
 * its first one and when it begins instead of "sem valor".
 */
export function costPriceLabel(cost: FixedCostOut, month: string): string {
  const price = priceInForce(cost.prices, month);
  if (price) return formatBrl(price.amount_cents);
  const first = [...cost.prices].sort((a, b) => a.from_month.localeCompare(b.from_month))[0];
  if (!first) return "sem valor";
  const from = first.from_month;
  return `a partir de ${monthName(from).toLowerCase()} ${from.slice(0, 4)} ${formatBrl(first.amount_cents)}`;
}
