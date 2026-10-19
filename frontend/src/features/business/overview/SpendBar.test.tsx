import { render, screen } from "@testing-library/react";
import { SpendBar } from "./SpendBar";
import { formatTenths, shareTenths } from "./share";

test("percentages round half-up like the backend", () => {
  expect(shareTenths(1, 8)).toBe(125);
  expect(formatTenths(shareTenths(1, 8)!)).toBe("12,5%");
  expect(shareTenths(1, 3)).toBe(333);
  expect(shareTenths(5, 4)).toBeNull();
  expect(shareTenths(0, 0)).toBeNull();
});

test("slices are sized by amount and the legend covers every one", () => {
  render(
    <SpendBar
      inCents={1000}
      outCents={250}
      byType={[{ type_id: "a", type_name: "Café", palette_slot: 3, amount_cents: 250 }]}
    />,
  );
  expect(screen.getByRole("img", { name: "Para onde foi o que entrou" }).children).toHaveLength(2);
  expect(screen.getByText("Café 25,0% · R$ 2,50")).toBeInTheDocument();
  expect(screen.getByText("Livre 75,0% · R$ 7,50")).toBeInTheDocument();
});
