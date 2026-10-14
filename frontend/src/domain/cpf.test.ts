import { completeCpf, cpfDigits, formatCpf, isValidCpf } from "./cpf";

describe("cpfDigits", () => {
  test.each([
    ["123.456.789-09", "12345678909"],
    ["12345678909", "12345678909"],
    [" 987 654 321 00 ", "98765432100"],
    ["111.444.777-35", "11144477735"],
  ])("accepts %j", (input, digits) => {
    expect(cpfDigits(input)).toBe(digits);
  });

  test.each([
    "",
    "123.456.789-00",
    "11111111111",
    "1234567890",
    "123456789091",
    "abc12345678909",
    "123.456.789-09x",
    "１２３４５６７８９０９",
    "123.456.789-09 ",
  ])("rejects %j", (input) => {
    expect(cpfDigits(input)).toBeNull();
    expect(isValidCpf(input)).toBe(false);
  });
});

test("formatCpf punctuates a valid CPF and leaves anything else alone", () => {
  expect(formatCpf("12345678909")).toBe("123.456.789-09");
  expect(formatCpf("1234")).toBe("1234");
});

test("completeCpf adds the two check digits", () => {
  expect(completeCpf("123456789")).toBe("12345678909");
  expect(completeCpf("987654321")).toBe("98765432100");
  expect(isValidCpf(completeCpf("000000001"))).toBe(true);
});
