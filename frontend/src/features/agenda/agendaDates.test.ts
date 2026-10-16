import { addDays, dayHeading, weekday } from "./agendaDates";

test("addDays crosses months, years and daylight-saving changes", () => {
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(addDays("2026-10-15", 30)).toBe("2026-11-14");
  expect(addDays("2026-10-15", 90)).toBe("2027-01-13");
});

test("weekday counts from Sunday", () => {
  expect(weekday("2026-10-25")).toBe(0);
  expect(weekday("2026-10-24")).toBe(6);
});

test("day headings say today and tomorrow, otherwise the date", () => {
  expect(dayHeading("2026-10-15", "2026-10-15")).toBe("Hoje");
  expect(dayHeading("2026-10-16", "2026-10-15")).toBe("Amanhã");
  expect(dayHeading("2026-10-24", "2026-10-15")).toBe("sáb., 24/10/2026");
  expect(dayHeading("2026-10-14", "2026-10-15")).toBe("qua., 14/10/2026");
});
