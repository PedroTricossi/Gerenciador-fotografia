import type { ServiceIn, ServiceOut } from "../../api/client";
import { amountError, textError } from "../../domain/fieldRules";
import { formatBrlAmount, parseBrl } from "../../domain/money";

export type ServiceValues = { name: string; price: string; isPrewedding: boolean };
export type ServiceErrors = Partial<Record<"name" | "default_price_cents", string>>;

export function emptyServiceValues(): ServiceValues {
  return { name: "", price: "", isPrewedding: false };
}

export function serviceValues(service: ServiceOut): ServiceValues {
  return {
    name: service.name,
    price: formatBrlAmount(service.default_price_cents),
    isPrewedding: service.is_prewedding,
  };
}

export function validateService(values: ServiceValues): ServiceErrors {
  const errors: ServiceErrors = {};
  const name = textError(values.name, 200, true);
  const price = amountError(values.price, true);
  if (name) errors.name = name;
  if (price) errors.default_price_cents = price;
  return errors;
}

export function toServiceRequest(values: ServiceValues): ServiceIn {
  return {
    name: values.name.trim(),
    default_price_cents: parseBrl(values.price) ?? Number.NaN,
    is_prewedding: values.isPrewedding,
  };
}
