import { type UseFormReturn, get } from "react-hook-form";
import { formatBrlAmount } from "../../../domain/money";
import { Field, Select } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import type { ServiceOption } from "../serviceOptions";

type Props = {
  form: UseFormReturn<ContractFormValues>;
  index: number;
  options: ServiceOption[];
  /** Services chosen in other rows. */
  taken: ReadonlySet<string>;
};

export function ServiceField({ form, index, options, taken }: Props) {
  const name = `payment.items.${index}.service_id` as const;
  const amount = `payment.items.${index}.amount_cents` as const;
  const error = (get(form.formState.errors, name) as { message?: string } | undefined)?.message;
  const registration = form.register(name, {
    // A native select only fires change for a different option, so re-picking keeps a typed price.
    onChange: (event: { target: { value: string } }) => {
      const option = options.find((candidate) => candidate.id === event.target.value);
      if (!option) return;
      form.setValue(amount, formatBrlAmount(option.defaultPriceCents), {
        shouldDirty: true,
        shouldValidate: Boolean(get(form.formState.errors, amount)),
      });
    },
  });
  return (
    <Field label={`Serviço do item ${index + 1}`} error={error}>
      {(control) => (
        <Select {...control} {...registration}>
          <option value="">Selecione um serviço</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={taken.has(option.id)}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
