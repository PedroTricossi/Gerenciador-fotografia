// ASCII whitespace only, as the backend reads the CPF with re.ASCII.
const ALLOWED = /^[0-9. \t\n\r\f\v-]*$/;

function checkDigit(digits: string): number {
  const weight = digits.length + 1;
  let total = 0;
  for (let index = 0; index < digits.length; index += 1) {
    total += Number(digits[index]) * (weight - index);
  }
  const remainder = (total * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function cpfDigits(value: string): string | null {
  if (!ALLOWED.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 11 || digits === digits[0]!.repeat(11)) return null;
  if (checkDigit(digits.slice(0, 9)) !== Number(digits[9])) return null;
  if (checkDigit(digits.slice(0, 10)) !== Number(digits[10])) return null;
  return digits;
}

export function isValidCpf(value: string): boolean {
  return cpfDigits(value) !== null;
}

export function formatCpf(value: string): string {
  const digits = cpfDigits(value);
  if (digits === null) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function completeCpf(nineDigits: string): string {
  const first = checkDigit(nineDigits);
  const second = checkDigit(`${nineDigits}${first}`);
  return `${nineDigits}${first}${second}`;
}
