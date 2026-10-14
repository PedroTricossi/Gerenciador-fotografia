import { formatIsoDate, todayIso } from "./dates";

test("formats an ISO date the Brazilian way", () => {
  expect(formatIsoDate("2027-03-14")).toBe("14/03/2027");
});

test("today is the local calendar date", () => {
  expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  expect(todayIso(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
});
