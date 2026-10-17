import { type FieldPathByValue, type UseFormReturn, get } from "react-hook-form";
import { Field, TextInput } from "../../../ui";
import type { ContractFormValues } from "../formModel";

type Props = {
  form: UseFormReturn<ContractFormValues>;
  // Every input in the form holds text, which is what `format` needs.
  name: FieldPathByValue<ContractFormValues, string>;
  label: string;
  hint?: string;
  size?: "short" | "wide";
  type?: "text" | "date" | "time" | "number";
  adornment?: string;
  inputMode?: "text" | "decimal" | "numeric";
  /** Tidies the typed text when the input loses focus. */
  format?: (text: string) => string;
};

export function TextField({
  form,
  name,
  label,
  hint,
  size,
  type = "text",
  adornment,
  inputMode,
  format,
}: Props) {
  const error = (get(form.formState.errors, name) as { message?: string } | undefined)?.message;
  const registration = form.register(name, {
    onBlur: format
      ? (event: { target: { value: string } }) => {
          const tidy = format(event.target.value);
          if (tidy !== event.target.value) form.setValue(name, tidy, { shouldDirty: true });
        }
      : undefined,
  });
  return (
    <Field label={label} hint={hint} error={error} size={size}>
      {(control) => (
        <TextInput
          {...control}
          {...registration}
          type={type}
          adornment={adornment}
          inputMode={inputMode}
          autoComplete="off"
        />
      )}
    </Field>
  );
}
