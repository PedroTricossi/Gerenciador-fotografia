import { act, render, screen } from "@testing-library/react";
import { PageLayout } from "./PageLayout";

test("the heading's name is the plain title", () => {
  render(<PageLayout title="Contratos" />);
  const heading = screen.getByRole("heading", { level: 1, name: "Contratos" });
  expect(heading).toBeInTheDocument();
  expect(heading).not.toHaveAccessibleName(/[>_]/);
});

test("the heading's text is exactly the title", () => {
  render(<PageLayout title="Contratos" />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Contratos");
});

test("the title types itself out on screen while its text stays whole", () => {
  vi.useFakeTimers();
  render(<PageLayout title="Agenda" />);
  const heading = screen.getByRole("heading", { level: 1, name: "Agenda" });
  const text = heading.querySelector("[data-typed]");
  expect(text).toHaveAttribute("data-typed", "");
  act(() => vi.advanceTimersByTime(45 * 3));
  expect(text).toHaveAttribute("data-typed", "Age");
  expect(heading.textContent).toBe("Agenda");
  act(() => vi.advanceTimersByTime(45 * 3));
  expect(heading.querySelector("[data-typed]")).toBeNull();
  vi.useRealTimers();
});
