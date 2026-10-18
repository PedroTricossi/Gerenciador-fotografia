import { groupInstalments, monthLabel, monthName, shortDate, type InstalmentItem } from "./groups";

function item(number: number, month: string, paid_on: string | null = null): InstalmentItem {
  return {
    contract_id: "c1",
    groom_name: "Bruno",
    bride_name: "Ana",
    number,
    count: 4,
    month,
    amount_cents: 1000,
    paid_on,
    plan_needs_review: false,
  };
}

const nov = item(1, "2026-11");
const novPaid = item(2, "2026-11", "2026-11-05");
const dec = item(3, "2026-12");
const decPaid = item(4, "2026-12", "2026-12-02");
const jan = item(1, "2027-01");
const feb = item(2, "2027-02");
const janPaid = item(3, "2027-01", "2027-01-03");

test("late holds unpaid earlier months, this month holds all of it, upcoming groups later months", () => {
  const groups = groupInstalments([novPaid, nov, dec, decPaid, jan, janPaid, feb], "2026-12");
  expect(groups.late).toEqual([nov]);
  expect(groups.thisMonth).toEqual([dec, decPaid]);
  expect(groups.upcoming).toEqual([
    { month: "2027-01", items: [jan] },
    { month: "2027-02", items: [feb] },
  ]);
});

test("empty groups when nothing matches", () => {
  expect(groupInstalments([], "2026-12")).toEqual({ late: [], thisMonth: [], upcoming: [] });
});

test("month names and short dates", () => {
  expect(monthName("2026-10")).toBe("Outubro");
  expect(shortDate("2026-10-07")).toBe("07/10");
});

test("monthLabel adds the year outside the current year", () => {
  expect(monthLabel("2026-10", "2026-10")).toBe("Outubro");
  expect(monthLabel("2025-12", "2026-10")).toBe("Dezembro 2025");
  expect(monthLabel("2027-01", "2026-10")).toBe("Janeiro 2027");
});
