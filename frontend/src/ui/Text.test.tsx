import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Button } from "./Button";
import { SegmentedControl } from "./SegmentedControl";
import { EmptyState, Hint, Loading, TextLink } from "./Text";

test("Loading is a status with the default text", () => {
  render(<Loading />);
  expect(screen.getByRole("status")).toHaveTextContent("Carregando…");
});

test("Hint renders its id so a button can be described by it", () => {
  render(
    <>
      <Button aria-describedby="h">Salvar</Button>
      <Hint id="h">Salve antes de sair.</Hint>
    </>,
  );
  expect(screen.getByRole("button", { name: "Salvar" })).toHaveAccessibleDescription(
    "Salve antes de sair.",
  );
});

test("EmptyState shows its text and action", () => {
  render(<EmptyState action={<Button>Novo</Button>}>Nada por aqui.</EmptyState>);
  expect(screen.getByText("Nada por aqui.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
});

test("TextLink is a link", () => {
  render(
    <MemoryRouter>
      <TextLink to="/x">Ir</TextLink>
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Ir" })).toHaveAttribute("href", "/x");
});

test("SegmentedControl is a group of toggle buttons", () => {
  const onChange = vi.fn();
  render(
    <SegmentedControl
      label="Visualização"
      options={[
        { value: "list", label: "Lista" },
        { value: "calendar", label: "Calendário" },
      ]}
      value="list"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("group", { name: "Visualização" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  screen.getByRole("button", { name: "Calendário" }).click();
  expect(onChange).toHaveBeenCalledWith("calendar");
});
