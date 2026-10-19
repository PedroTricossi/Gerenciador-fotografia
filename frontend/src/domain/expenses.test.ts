import { byCloseness, formatKm, parseKm, priceInForce, transportKindLabel } from "./expenses";

test.each([
  ["32", 320],
  ["32,5", 325],
  ["32.5", 325],
  ["32,55", null],
  ["0", null],
  ["5000,1", null],
  ["", null],
  ["abc", null],
])("parseKm(%j) is %j", (text, expected) => {
  expect(parseKm(text)).toBe(expected);
});

test("formatKm drops a zero decimal", () => {
  expect(formatKm(325)).toBe("32,5 km");
  expect(formatKm(320)).toBe("32 km");
});

test("byCloseness puts the nearest first and breaks ties with the earlier date", () => {
  const events = [{ date: "2026-10-20" }, { date: "2026-10-08" }, { date: "2026-10-12" }];
  expect(byCloseness(events, "2026-10-14").map((e) => e.date)).toEqual([
    "2026-10-12",
    "2026-10-08",
    "2026-10-20",
  ]);
  const tie = [{ date: "2026-10-16" }, { date: "2026-10-12" }];
  expect(byCloseness(tie, "2026-10-14").map((e) => e.date)).toEqual(["2026-10-12", "2026-10-16"]);
});

test("transportKindLabel names each kind", () => {
  expect(transportKindLabel("ride_app")).toBe("App (Uber/99)");
  expect(transportKindLabel("car")).toBe("Carro");
});

test("priceInForce picks the latest price not after the month", () => {
  const prices = [
    { from_month: "2026-01", amount_cents: 100 },
    { from_month: "2026-09", amount_cents: 200 },
    { from_month: "2026-12", amount_cents: 300 },
  ];
  expect(priceInForce(prices, "2026-10")?.amount_cents).toBe(200);
  expect(priceInForce(prices, "2025-12")).toBeNull();
});
