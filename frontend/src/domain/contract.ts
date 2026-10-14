const DISCOUNT_MESSAGE = "o desconto deve ser maior que zero e menor que a soma dos itens";

function isPositiveCents(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

export function subtotalCents(amounts: readonly (number | null)[]): number | null {
  if (amounts.length === 0 || !amounts.every(isPositiveCents)) return null;
  return (amounts as number[]).reduce((sum, amount) => sum + amount, 0);
}

export function discountError(
  amounts: readonly (number | null)[],
  discount: number | null,
): string | null {
  if (discount === null) return null;
  const subtotal = subtotalCents(amounts);
  if (subtotal === null) return null;
  if (!isPositiveCents(discount) || discount >= subtotal) return DISCOUNT_MESSAGE;
  return null;
}

export function totalCents(
  amounts: readonly (number | null)[],
  discount: number | null,
): number | null {
  const subtotal = subtotalCents(amounts);
  if (subtotal === null) return null;
  if (discount === null) return subtotal;
  return discountError(amounts, discount) === null ? subtotal - discount : null;
}
