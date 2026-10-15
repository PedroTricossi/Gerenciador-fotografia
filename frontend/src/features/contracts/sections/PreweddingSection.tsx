import { useEffect } from "react";
import type { PreweddingOut } from "../../../api/client";
import { useServices } from "../../../api/services";
import { FormSection } from "../../../ui";
import styles from "../ContractForm.module.css";
import { emptyPrewedding, isBlankPrewedding, preweddingSummary } from "../preweddingForm";
import { preweddingServiceIds } from "../serviceOptions";
import type { ContractFormState } from "../useContractForm";
import { TextField } from "./TextField";

type Props = {
  state: ContractFormState;
  disabled: boolean;
  /** Absent while creating: the fields are editable. Otherwise the stored pre-wedding. */
  summary?: PreweddingOut | null;
};

export function PreweddingSection({ state, disabled, summary }: Props) {
  const { form } = state;
  const services = useServices(true);
  const ids = preweddingServiceIds(services.data ?? []);
  const included = state.values.payment.items.some((item) => ids.has(item.service_id));
  const editable = summary === undefined;

  // Values typed into a section that is now hidden must not be sent.
  useEffect(() => {
    if (editable && !included && !isBlankPrewedding(form.getValues("prewedding"))) {
      form.setValue("prewedding", emptyPrewedding());
      form.clearErrors("prewedding");
    }
  }, [editable, included, form]);

  if (editable) {
    if (!included) return null;
    return (
      <FormSection title="Pré-wedding" disabled={disabled}>
        <p className={styles.row}>Pode deixar em branco e agendar depois.</p>
        <TextField form={form} name="prewedding.date" label="Data do pré-wedding" type="date" />
        <TextField form={form} name="prewedding.venue_name" label="Local do pré-wedding" />
        <TextField
          form={form}
          name="prewedding.venue_address"
          label="Endereço do pré-wedding"
          hint="Opcional"
        />
        <TextField
          form={form}
          name="prewedding.start_time"
          label="Horário do pré-wedding"
          type="time"
          hint="Opcional"
        />
      </FormSection>
    );
  }

  if (!included && summary === null) return null;
  return (
    <FormSection title="Pré-wedding" disabled={disabled}>
      <p className={styles.row}>
        {summary ? `Pré-wedding: ${preweddingSummary(summary)}` : "Pré-wedding: não agendado"}
      </p>
      <p className={styles.row}>
        Para agendar ou alterar, use o botão de pré-wedding na lista de contratos.
      </p>
    </FormSection>
  );
}
