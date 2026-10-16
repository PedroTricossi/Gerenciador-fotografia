import {
  addDays,
  dayHeading,
  dayLabel,
  monthGrid,
  monthOf,
  monthTitle,
  shiftMonth,
  weekday,
} from "./agendaDates";

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

test("a month grid covers whole weeks from Sunday to Saturday", () => {
  const october = monthGrid({ year: 2026, month: 9 });
  expect([october[0], october.at(-1), october.length]).toEqual(["2026-09-27", "2026-10-31", 35]);

  const november = monthGrid({ year: 2026, month: 10 });
  expect([november[0], november.at(-1), november.length]).toEqual(["2026-11-01", "2026-12-05", 35]);

  const leapFebruary = monthGrid({ year: 2028, month: 1 });
  expect([leapFebruary[0], leapFebruary.at(-1)]).toEqual(["2028-01-30", "2028-03-04"]);
  expect(leapFebruary).toContain("2028-02-29");
});

test("months shift across years and have Portuguese titles", () => {
  expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  expect(monthOf("2026-10-15")).toEqual({ year: 2026, month: 9 });
  expect(monthTitle({ year: 2026, month: 9 })).toBe("outubro de 2026");
  expect(dayLabel("2026-10-05")).toBe("5 de outubro de 2026");
});
