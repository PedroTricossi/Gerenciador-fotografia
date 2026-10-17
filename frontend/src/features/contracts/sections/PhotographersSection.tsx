import type { UseFormReturn } from "react-hook-form";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function PhotographersSection({ form, disabled }: Props) {
  return (
    <FormSection title="Fotógrafos" disabled={disabled}>
      <TextField
        form={form}
        name="photographer_count"
        label="Número de fotógrafos"
        size="short"
        type="number"
        inputMode="numeric"
      />
    </FormSection>
  );
}
