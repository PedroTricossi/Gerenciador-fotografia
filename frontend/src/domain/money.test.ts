import { MAX_CENTS, formatBrl, formatBrlAmount, parseBrl } from "./money";

describe("parseBrl", () => {
  test.each([
    ["1.200,00", 120000],
    ["1200", 120000],
    ["1200,5", 120050],
    ["1.200", 120000],
    ["R$ 1.200,00", 120000],
    ["R$1.234.567,89", 123456789],
    ["  300,00 ", 30000],
    ["0,01", 1],
  ])("reads %j as %i cents", (text, cents) => {
    expect(parseBrl(text)).toBe(cents);
  });

  test.each(["", "   "])("treats %j as empty", (text) => {
    expect(parseBrl(text)).toBeNull();
  });

  test.each(["abc", "12,345", "1.20", "1,2,3", "-100", "1.2345", "12.00", "1 200"])(
    "rejects %j",
    (text) => {
      expect(parseBrl(text)).toBeNaN();
    },
  );
});

describe("formatting", () => {
  test.each([
    [1, "0,01"],
    [120000, "1.200,00"],
    [123456789, "1.234.567,89"],
    [MAX_CENTS, "1.000.000,00"],
  ])("%i cents is %j", (cents, text) => {
    expect(formatBrlAmount(cents)).toBe(text);
    expect(formatBrl(cents)).toBe(`R$ ${text}`);
  });

  test("a formatted amount parses back to the same cents", () => {
    for (const cents of [1, 99, 100, 101, 99999, 100000, 7654321, MAX_CENTS]) {
      expect(parseBrl(formatBrlAmount(cents))).toBe(cents);
    }
  });
});
