import { render, screen } from "@testing-library/react";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

test("links the label, the hint and the error to the control", () => {
  render(
    <Field label="CPF do noivo" hint="Somente números ou com pontuação" error="CPF inválido">
      {(control) => <TextInput {...control} />}
    </Field>,
  );
  const input = screen.getByLabelText("CPF do noivo");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Somente números ou com pontuação CPF inválido");
});

test("a field without an error is valid and shows the adornment", () => {
  render(<Field label="Valor">{(control) => <TextInput {...control} adornment="R$" />}</Field>);
  expect(screen.getByLabelText("Valor")).toHaveAttribute("aria-invalid", "false");
  expect(screen.getByText("R$")).toBeInTheDocument();
});
