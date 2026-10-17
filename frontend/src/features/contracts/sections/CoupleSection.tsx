import type { UseFormReturn } from "react-hook-form";
import { formatCpf } from "../../../domain/cpf";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import styles from "../ContractForm.module.css";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function CoupleSection({ form, disabled }: Props) {
  return (
    <FormSection title="Casal" disabled={disabled}>
      <div className={styles.pair}>
        <TextField form={form} name="groom.full_name" label="Nome do noivo" />
        <TextField
          form={form}
          name="groom.cpf"
          label="CPF do noivo"
          size="short"
          inputMode="numeric"
          format={formatCpf}
        />
      </div>
      <div className={styles.pair}>
        <TextField form={form} name="bride.full_name" label="Nome da noiva" />
        <TextField
          form={form}
          name="bride.cpf"
          label="CPF da noiva"
          size="short"
          inputMode="numeric"
          format={formatCpf}
        />
      </div>
      <TextField
        form={form}
        name="couple_address"
        label="Endereço do casal"
        size="wide"
        hint="Impresso no contrato para os dois."
      />
    </FormSection>
  );
}
