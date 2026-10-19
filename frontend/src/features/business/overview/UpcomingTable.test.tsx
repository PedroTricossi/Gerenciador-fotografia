import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { UpcomingTable } from "./UpcomingTable";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 20, 10) });
});
afterEach(() => vi.useRealTimers());

test("labels the rest of the month, next year's months with their year, and negatives", () => {
  render(
    <MemoryRouter>
      <UpcomingTable
        lateCents={0}
        rows={[
          {
            month: "2026-10",
            rest_of_month: true,
            in_cents: 0,
            out_cents: 0,
            projected_free_cents: 100,
          },
          {
            month: "2027-01",
            rest_of_month: false,
            in_cents: 0,
            out_cents: 5000,
            projected_free_cents: -4900,
          },
        ]}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText("resto de outubro")).toBeInTheDocument();
  expect(screen.getByText("janeiro 2027")).toBeInTheDocument();
  expect(screen.getByText("−R$ 49,00")).toBeInTheDocument();
});
