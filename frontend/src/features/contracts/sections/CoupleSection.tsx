import type { UseFormReturn } from "react-hook-form";
import { formatCpf } from "../../../domain/cpf";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function CoupleSection({ form, disabled }: Props) {
  return (
    <FormSection title="Casal" disabled={disabled}>
      <TextField form={form} name="groom.full_name" label="Nome do noivo" />
      <TextField
        form={form}
        name="groom.cpf"
        label="CPF do noivo"
        inputMode="numeric"
        format={formatCpf}
      />
      <TextField form={form} name="bride.full_name" label="Nome da noiva" />
      <TextField
        form={form}
        name="bride.cpf"
        label="CPF da noiva"
        inputMode="numeric"
        format={formatCpf}
      />
      <TextField
        form={form}
        name="couple_address"
        label="Endereço do casal"
        hint="Impresso no contrato para os dois."
      />
    </FormSection>
  );
}
