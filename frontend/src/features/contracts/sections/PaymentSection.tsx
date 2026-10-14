import { formatBrl } from "../../../domain/money";
import { Button, FormSection } from "../../../ui";
import styles from "../ContractForm.module.css";
import { moneyText } from "../formModel";
import type { ContractFormState } from "../useContractForm";
import { TextField } from "./TextField";

type Props = { state: ContractFormState; disabled: boolean };

export function PaymentSection({ state, disabled }: Props) {
  const { form, items } = state;
  return (
    <FormSection title="Pagamento" disabled={disabled}>
      {items.fields.map((field, index) => (
        <div key={field.id} className={styles.item}>
          <TextField
            form={form}
            name={`payment.items.${index}.description`}
            label={`Descrição do item ${index + 1}`}
          />
          <TextField
            form={form}
            name={`payment.items.${index}.amount_cents`}
            label={`Valor do item ${index + 1}`}
            adornment="R$"
            inputMode="decimal"
            format={moneyText}
          />
          <Button
            variant="ghost"
            aria-label={`Remover item ${index + 1}`}
            disabled={items.fields.length === 1}
            onClick={() => state.removeItem(index)}
          >
            Remover
          </Button>
        </div>
      ))}
      <div className={styles.row}>
        <Button onClick={state.addItem} disabled={!state.canAddItem}>
          Adicionar item
        </Button>
      </div>
      <TextField
        form={form}
        name="payment.pix_discount_cents"
        label="Desconto PIX"
        hint="Opcional"
        adornment="R$"
        inputMode="decimal"
        format={moneyText}
      />
      <p className={styles.row}>
        Total: <strong>{state.total === null ? "—" : formatBrl(state.total)}</strong>
      </p>
    </FormSection>
  );
}
