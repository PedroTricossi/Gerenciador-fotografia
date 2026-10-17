import {
  addMonths,
  currentMonth,
  inReminderWindow,
  spreadChange,
  splitEqually,
} from "./instalments";

test.each([
  [1000, 3, [333, 333, 334]],
  [396000, 4, [99000, 99000, 99000, 99000]],
  [10000, 1, [10000]],
  [1001, 2, [500, 501]],
])("splitEqually(%i, %i) is %j", (total, count, expected) => {
  expect(splitEqually(total, count)).toEqual(expected);
});

test("spreadChange keeps paid amounts and spreads the rest equally", () => {
  expect(spreadChange([100, 100, 100], [true, false, false], 400)).toEqual([100, 150, 150]);
  expect(spreadChange([100, 100, 100], [false, false, false], 301)).toEqual([100, 100, 101]);
  expect(spreadChange([100, 100], [false, false], 100)).toEqual([50, 50]);
});

test("spreadChange leaves a plan that already adds up as it is", () => {
  expect(spreadChange([30, 70], [true, false], 100)).toEqual([30, 70]);
  expect(spreadChange([30, 70], [true, true], 100)).toEqual([30, 70]);
});

test("spreadChange returns null where the server would refuse", () => {
  expect(spreadChange([30, 70], [true, true], 200)).toBeNull();
  expect(spreadChange([100, 100], [true, false], 100)).toBeNull();
  expect(spreadChange([100, 100], [false, false], 1)).toBeNull();
});

test.each([
  ["2026-10", 1, "2026-11"],
  ["2026-12", 1, "2027-01"],
  ["2026-11", 3, "2027-02"],
  ["2026-01", 0, "2026-01"],
  ["2026-12", 13, "2028-01"],
])("addMonths(%s, %i) is %s", (month, n, expected) => {
  expect(addMonths(month, n)).toBe(expected);
});

test("currentMonth uses the local date", () => {
  expect(currentMonth(new Date(2026, 9, 17))).toBe("2026-10");
  expect(currentMonth(new Date(2027, 0, 1))).toBe("2027-01");
});

test.each([
  [new Date(2026, 9, 24), false],
  [new Date(2026, 9, 25), true],
  [new Date(2026, 9, 31), true],
  [new Date(2026, 8, 23), false],
  [new Date(2026, 8, 24), true],
  [new Date(2027, 1, 21), false],
  [new Date(2027, 1, 22), true],
  [new Date(2028, 1, 22), false],
  [new Date(2028, 1, 23), true],
])("inReminderWindow(%s) is %s", (day, expected) => {
  expect(inReminderWindow(day)).toBe(expected);
});
