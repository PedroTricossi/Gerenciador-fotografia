/** The backend's largest accepted amount: R$ 1.000.000,00. */
export const MAX_CENTS = 100_000_000;

// Whole reais, either plain ("1200") or grouped by dots in threes ("1.200"),
// then an optional comma with one or two decimal digits.
const BRL = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

export function parseBrl(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const match = BRL.exec(trimmed);
  if (match === null) return Number.NaN;
  const reais = Number(match[1]!.replaceAll(".", ""));
  const centavos = Number((match[2] ?? "").padEnd(2, "0"));
  return reais * 100 + centavos;
}

export function formatBrlAmount(cents: number): string {
  const reais = Math.trunc(cents / 100).toString();
  const centavos = (cents % 100).toString().padStart(2, "0");
  const grouped = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${centavos}`;
}

export function formatBrl(cents: number): string {
  return `R$ ${formatBrlAmount(cents)}`;
}
