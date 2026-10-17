import { render, screen } from "@testing-library/react";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

test("a money input keeps its label and is described as em reais", () => {
  render(<Field label="Valor do item 1">{(c) => <TextInput {...c} adornment="R$" />}</Field>);
  expect(screen.getByLabelText("Valor do item 1")).toHaveAccessibleDescription(/em reais/);
});

test("a field with an error is described by both the adornment and the error", () => {
  render(
    <Field label="Valor do item 1" error="valor inválido">
      {(c) => <TextInput {...c} adornment="R$" />}
    </Field>,
  );
  const description = screen.getByLabelText("Valor do item 1");
  expect(description).toHaveAccessibleDescription(/em reais/);
  expect(description).toHaveAccessibleDescription(/valor inválido/);
});

test("without an adornment nothing extra is described", () => {
  render(<Field label="Nome">{(c) => <TextInput {...c} />}</Field>);
  expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-describedby");
  expect(screen.getByLabelText("Nome")).toHaveAccessibleDescription("");
});
