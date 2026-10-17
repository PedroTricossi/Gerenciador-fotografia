import { render, screen } from "@testing-library/react";
import { Table } from "./Table";

test("the scrolling wrapper is a focusable named region", () => {
  render(
    <Table
      label="Contratos"
      columns={[{ header: "Nome", cell: (row: string) => row }]}
      rows={["Ana"]}
      rowKey={(row) => row}
    />,
  );
  const region = screen.getByRole("region", { name: "Contratos" });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(region).toContainElement(screen.getByRole("table", { name: "Contratos" }));
});
