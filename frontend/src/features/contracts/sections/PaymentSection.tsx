import { useServices } from "../../../api/services";
import { formatBrl } from "../../../domain/money";
import { Banner, Button, FormSection, Loading, TextLink } from "../../../ui";
import styles from "../ContractForm.module.css";
import { moneyText } from "../formModel";
import { type SavedItem, serviceOptions } from "../serviceOptions";
import type { ContractFormState } from "../useContractForm";
import { ServiceField } from "./ServiceField";
import { TextField } from "./TextField";

type Props = { state: ContractFormState; disabled: boolean; savedItems: SavedItem[] };

export function PaymentSection({ state, disabled, savedItems }: Props) {
  const { form, items } = state;
  const services = useServices(true);

  if (services.data === undefined && services.isPending) {
    return (
      <FormSection title="Pagamento" disabled>
        <div className={styles.row}>
          <Loading>Carregando serviços…</Loading>
        </div>
      </FormSection>
    );
  }
  if (services.data === undefined) {
    return (
      <FormSection title="Pagamento" disabled={disabled}>
        <div className={styles.row}>
          <Banner tone="error">
            Não foi possível carregar os serviços.{" "}
            <Button onClick={() => void services.refetch()}>Tentar de novo</Button>
          </Banner>
        </div>
      </FormSection>
    );
  }

  const options = serviceOptions(services.data, savedItems);
  if (options.length === 0) {
    return (
      <FormSection title="Pagamento" disabled={disabled}>
        <p className={styles.row}>
          Nenhum serviço cadastrado. <TextLink to="/servicos">Cadastre os serviços</TextLink> antes
          de criar o contrato.
        </p>
      </FormSection>
    );
  }

  const chosen = state.values.payment.items.map((item) => item.service_id);
  return (
    <FormSection title="Pagamento" disabled={disabled}>
      {items.fields.map((field, index) => (
        <div key={field.id} className={styles.item}>
          <ServiceField
            form={form}
            index={index}
            options={options}
            taken={new Set(chosen.filter((id, other) => other !== index && id !== ""))}
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
            variant="secondary"
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
      <p className={styles.total}>
        Total: <strong>{state.total === null ? "—" : formatBrl(state.total)}</strong>
      </p>
    </FormSection>
  );
}
