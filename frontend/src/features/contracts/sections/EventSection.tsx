import type { UseFormReturn } from "react-hook-form";
import { FormSection } from "../../../ui";
import type { ContractFormValues } from "../formModel";
import { TextField } from "./TextField";

type Props = { form: UseFormReturn<ContractFormValues>; disabled: boolean };

export function EventSection({ form, disabled }: Props) {
  return (
    <FormSection title="Evento" disabled={disabled}>
      <TextField form={form} name="event.date" label="Data do evento" type="date" />
      <TextField form={form} name="event.venue_name" label="Local do evento" />
      <TextField form={form} name="event.venue_address" label="Endereço do local" hint="Opcional" />
      <TextField
        form={form}
        name="event.coverage_start"
        label="Início da cobertura"
        type="time"
        hint="Opcional"
      />
      <TextField
        form={form}
        name="event.coverage_end"
        label="Fim da cobertura"
        type="time"
        hint="Opcional"
      />
      <TextField
        form={form}
        name="event.hours_contracted"
        label="Horas contratadas"
        type="number"
        inputMode="numeric"
        hint="Opcional, de 1 a 24"
      />
    </FormSection>
  );
}
