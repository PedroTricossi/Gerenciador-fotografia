import { MAX_CENTS, parseBrl } from "./money";

export const REQUIRED = "campo obrigatório";
// Unicode category Cc, as the backend refuses it.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export function textError(value: string, max: number, required: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return required ? REQUIRED : null;
  // The API strips whitespace before refusing control characters, so check the trimmed text.
  if (CONTROL.test(trimmed)) return "não pode conter caracteres de controle";
  // Python counts code points, so an astral character is one character here too.
  if ([...trimmed].length > max) return `máximo de ${max} caracteres`;
  return null;
}

export function amountError(text: string, required: boolean): string | null {
  const cents = parseBrl(text);
  if (cents === null) return required ? REQUIRED : null;
  if (Number.isNaN(cents)) return "valor inválido";
  if (cents <= 0) return "o valor deve ser maior que zero";
  if (cents > MAX_CENTS) return "valor máximo R$ 1.000.000,00";
  return null;
}
