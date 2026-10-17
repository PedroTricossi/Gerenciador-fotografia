import type { UseFormReturn } from "react-hook-form";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function SigningSection({ form, disabled }: Props) {
  return (
    <FormSection title="Assinatura" disabled={disabled}>
      <TextField form={form} name="signing.city" label="Cidade da assinatura" />
      <TextField
        form={form}
        name="signing.date"
        label="Data da assinatura"
        type="date"
        size="short"
      />
    </FormSection>
  );
}
