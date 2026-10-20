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

test("a merged Outros slice is ordered by size, before smaller named slices, and Livre is last", () => {
  render(
    <SpendBar
      inCents={10000}
      outCents={5000}
      byType={[
        { type_id: "a", type_name: "Café", palette_slot: 3, amount_cents: 1000 },
        { type_id: "b", type_name: "Livros", palette_slot: null, amount_cents: 2000 },
        { type_id: "c", type_name: "Cursos", palette_slot: null, amount_cents: 2000 },
      ]}
    />,
  );
  const items = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(items).toEqual([
    "Outros 40,0% · R$ 40,00",
    "Café 10,0% · R$ 10,00",
    "Livre 50,0% · R$ 50,00",
  ]);
});
