import { get } from "react-hook-form";
import { formatIsoDate } from "../../../domain/dates";
import { MAX_INSTALMENTS } from "../../../domain/instalments";
import { formatBrl } from "../../../domain/money";
import { Banner, Field, FormSection, SegmentedControl, Select } from "../../../ui";
import styles from "../ContractForm.module.css";
import { moneyText } from "../formModel";
import type { ContractFormState } from "../useContractForm";
import { TextField } from "./TextField";

type Props = { state: ContractFormState; disabled: boolean };

const MODES = [
  { value: "single", label: "À vista" },
  { value: "split", label: "Parcelado" },
] as const;

const COUNTS = Array.from({ length: MAX_INSTALMENTS - 1 }, (_, index) => index + 2);

export function PlanSection({ state, disabled }: Props) {
  const { form, planRows, values } = state;
  const sumError = (get(form.formState.errors, "plan.sum") as { message?: string } | undefined)
    ?.message;
  const rows = values.plan.rows;
  // Paid rows stay, so the plan cannot shrink past them.
  const minimum = Math.max(2, state.paidCount);

  return (
    <FormSection title="Parcelas" disabled={disabled}>
      <p className={styles.row}>
        Total após desconto PIX:{" "}
        <strong>{state.total === null ? "—" : formatBrl(state.total)}</strong>
      </p>
      <div className={styles.row}>
        <SegmentedControl
          label="Forma de pagamento"
          options={MODES}
          value={values.plan.mode}
          onChange={state.setPlanMode}
        />
      </div>
      {values.plan.mode === "split" && (
        <Field label="Nº de parcelas" size="short">
          {(control) => (
            <Select
              {...control}
              value={rows.length}
              onChange={(event) => state.setPlanCount(Number(event.target.value))}
            >
              {COUNTS.filter((count) => count >= minimum).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {planRows.fields.map((field, index) => {
        const paidOn = rows[index]?.paidOn ?? null;
        return (
          <div key={field.id} className={styles.instalment}>
            <TextField
              form={form}
              name={`plan.rows.${index}.month`}
              label={`Mês da parcela ${index + 1}`}
              type="month"
              disabled={paidOn !== null}
            />
            <TextField
              form={form}
              name={`plan.rows.${index}.amount`}
              label={`Valor da parcela ${index + 1}`}
              adornment="R$"
              inputMode="decimal"
              format={moneyText}
              disabled={paidOn !== null}
              onEdit={state.markPlanEdited}
            />
            {paidOn !== null && (
              <p className={styles.paidOn}>paga em {formatIsoDate(paidOn).slice(0, 5)}</p>
            )}
          </div>
        );
      })}
      {sumError && (
        <div className={styles.row}>
          <Banner tone="error">{sumError}</Banner>
        </div>
      )}
    </FormSection>
  );
}
