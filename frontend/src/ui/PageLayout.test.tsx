import { render, screen } from "@testing-library/react";
import { PageLayout } from "./PageLayout";

test("the heading's name is the plain title", () => {
  render(<PageLayout title="Contratos" />);
  const heading = screen.getByRole("heading", { level: 1, name: "Contratos" });
  expect(heading).toBeInTheDocument();
  expect(heading).not.toHaveAccessibleName(/[>_]/);
});
