type Price = { from_month: string; amount_cents: number };
type TransportKind = "car" | "ride_app" | "bus" | "plane" | "other";

const MAX_TENTHS = 50000;

/** Kilometres typed by the user ("32", "32,5", "32.5") to tenths; null when not valid. */
export function parseKm(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d))?$/.exec(text.trim());
  if (!match) return null;
  const tenths = Number(match[1]) * 10 + Number(match[2] ?? 0);
  return tenths > 0 && tenths <= MAX_TENTHS ? tenths : null;
}

/** 325 to "32,5 km"; 320 to "32 km". */
export function formatKm(tenths: number): string {
  const whole = Math.floor(tenths / 10);
  const rest = tenths % 10;
  return `${whole}${rest ? `,${rest}` : ""} km`;
}

/** Nearest first; a tie goes to the earlier date. ISO dates, so strings compare as days. */
export function byCloseness<T extends { date: string }>(events: T[], target: string): T[] {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const distance = (event: T) => Math.abs(day(event.date) - day(target));
  return [...events].sort(
    (a, b) => distance(a) - distance(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
  );
}

const TRANSPORT_LABELS: Record<TransportKind, string> = {
  car: "Carro",
  ride_app: "App (Uber/99)",
  bus: "Ônibus",
  plane: "Avião",
  other: "Outro",
};

export function transportKindLabel(kind: string): string {
  return TRANSPORT_LABELS[kind as TransportKind] ?? kind;
}

/** The price whose `from_month` is the latest one not after `month`; null before the first. */
export function priceInForce(prices: readonly Price[], month: string): Price | null {
  let found: Price | null = null;
  for (const price of prices) {
    if (price.from_month <= month && (!found || price.from_month > found.from_month)) found = price;
  }
  return found;
}
