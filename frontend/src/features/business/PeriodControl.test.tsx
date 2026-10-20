import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodControl, type Period, periodLabel, shiftPeriod } from "./PeriodControl";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 19, 10) });
});
afterEach(() => vi.useRealTimers());

function setup(value: Period) {
  const onChange = vi.fn();
  render(<PeriodControl value={value} onChange={onChange} />);
  return { onChange, user: userEvent.setup({ advanceTimers: () => {} }) };
}

test("next period from 2026-12 is 2027-01", async () => {
  const { onChange, user } = setup({ kind: "month", value: "2026-12" });
  await user.click(screen.getByRole("button", { name: "Próximo período" }));
  expect(onChange).toHaveBeenCalledWith({ kind: "month", value: "2027-01" });
});

test("previous and next in Ano mode move by a year", async () => {
  const { onChange, user } = setup({ kind: "year", value: "2026" });
  await user.click(screen.getByRole("button", { name: "Próximo período" }));
  expect(onChange).toHaveBeenLastCalledWith({ kind: "year", value: "2027" });
  await user.click(screen.getByRole("button", { name: "Período anterior" }));
  expect(onChange).toHaveBeenLastCalledWith({ kind: "year", value: "2025" });
});

test("switching to Ano keeps the year", async () => {
  const { onChange, user } = setup({ kind: "month", value: "2026-10" });
  await user.click(screen.getByRole("button", { name: "Ano" }));
  expect(onChange).toHaveBeenCalledWith({ kind: "year", value: "2026" });
});

test("back to Mês gives the current month when it is in that year", async () => {
  const { onChange, user } = setup({ kind: "year", value: "2026" });
  await user.click(screen.getByRole("button", { name: "Mês" }));
  expect(onChange).toHaveBeenCalledWith({ kind: "month", value: "2026-10" });
});

test("back to Mês gives January for another year", async () => {
  const { onChange, user } = setup({ kind: "year", value: "2025" });
  await user.click(screen.getByRole("button", { name: "Mês" }));
  expect(onChange).toHaveBeenCalledWith({ kind: "month", value: "2025-01" });
});

test("the heading names the period", () => {
  expect(periodLabel({ kind: "month", value: "2026-10" })).toBe("outubro 2026");
  expect(periodLabel({ kind: "year", value: "2026" })).toBe("2026");
  render(<PeriodControl value={{ kind: "month", value: "2026-10" }} onChange={() => {}} />);
  expect(screen.getByRole("heading", { name: "outubro 2026" })).toBeVisible();
  expect(screen.getByRole("group", { name: "Período" })).toBeVisible();
});

test("shiftPeriod crosses year ends backwards", () => {
  expect(shiftPeriod({ kind: "month", value: "2026-01" }, -1)).toEqual({
    kind: "month",
    value: "2025-12",
  });
});
