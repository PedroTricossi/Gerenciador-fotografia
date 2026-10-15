import type { PreweddingIn, PreweddingOut } from "../../api/client";
import { formatIsoDate } from "../../domain/dates";
import { REQUIRED, textError } from "../../domain/fieldRules";

export type PreweddingValues = {
  date: string;
  venue_name: string;
  venue_address: string;
  start_time: string;
};
export type PreweddingErrors = Partial<Record<keyof PreweddingValues, string>>;

export function emptyPrewedding(): PreweddingValues {
  return { date: "", venue_name: "", venue_address: "", start_time: "" };
}

export function preweddingValues(prewedding: PreweddingOut): PreweddingValues {
  return {
    date: prewedding.date,
    venue_name: prewedding.venue_name,
    venue_address: prewedding.venue_address ?? "",
    start_time: prewedding.start_time ? prewedding.start_time.slice(0, 5) : "",
  };
}

export function isBlankPrewedding(values: PreweddingValues): boolean {
  return Object.values(values).every((value) => value.trim() === "");
}

export function validatePrewedding(values: PreweddingValues): PreweddingErrors {
  const errors: PreweddingErrors = {};
  if (values.date === "") errors.date = REQUIRED;
  const venue = textError(values.venue_name, 200, true);
  if (venue) errors.venue_name = venue;
  const address = textError(values.venue_address, 300, false);
  if (address) errors.venue_address = address;
  return errors;
}

const optional = (value: string) => (value.trim() === "" ? null : value.trim());

export function toPreweddingRequest(values: PreweddingValues): PreweddingIn {
  return {
    date: values.date,
    venue_name: values.venue_name.trim(),
    venue_address: optional(values.venue_address),
    start_time: optional(values.start_time),
  };
}

export function preweddingSummary(prewedding: PreweddingOut): string {
  const time = prewedding.start_time ? ` às ${prewedding.start_time.slice(0, 5)}` : "";
  return `${formatIsoDate(prewedding.date)}${time} · ${prewedding.venue_name}`;
}

export function preweddingButtonLabel(prewedding: PreweddingOut | null): string {
  return prewedding
    ? `Pré-wedding ${formatIsoDate(prewedding.date).slice(0, 5)}`
    : "Agendar pré-wedding";
}
