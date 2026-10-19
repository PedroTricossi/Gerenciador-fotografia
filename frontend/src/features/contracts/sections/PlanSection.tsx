import { get } from "react-hook-form";
import { formatIsoDate } from "../../../domain/dates";
import { MAX_INSTALMENTS } from "../../../domain/instalments";
import { formatBrl } from "../../../domain/money";
import { Banner, Field, FormSection, Hint, SegmentedControl, Select } from "../../../ui";
import styles from "../ContractForm.module.css";
import { moneyText, planSum } from "../formModel";
import type { ContractFormState } from "../useContractForm";
import { TextField } from "./TextField";

type Props = { state: ContractFormState; disabled: boolean; needsReview: boolean };

const MODES = [
  { value: "single", label: "À vista" },
  { value: "split", label: "Parcelado" },
] as const;

const COUNTS = Array.from({ length: MAX_INSTALMENTS - 1 }, (_, index) => index + 2);

export function PlanSection({ state, disabled, needsReview }: Props) {
  const { form, planRows, values } = state;
  // Only the server's message is shown here; the client's own check is the difference line below.
  const planError = get(form.formState.errors, "plan.sum") as
    { message?: string; type?: string } | undefined;
  const serverError = planError?.type === "server" ? planError.message : undefined;
  const rows = values.plan.rows;
  // Paid rows stay, so the plan cannot shrink past them.
  const minimum = Math.max(2, state.paidCount);
  const sum = planSum(values.plan);
  const difference = sum === null || state.total === null ? 0 : state.total - sum;

  return (
    <FormSection title="Parcelas" disabled={disabled}>
      <p className={styles.row}>
        Total após desconto PIX:{" "}
        <strong>{state.total === null ? "—" : formatBrl(state.total)}</strong>
      </p>
      {needsReview && (
        <div className={styles.row}>
          <Banner tone="info">Revise o plano de parcelas e salve para confirmar.</Banner>
        </div>
      )}
      <div className={styles.row}>
        <SegmentedControl
          label="Forma de pagamento"
          options={MODES.map((mode) =>
            mode.value === "single" ? { ...mode, disabled: state.singleBlocked } : mode,
          )}
          value={values.plan.mode}
          onChange={state.setPlanMode}
        />
      </div>
      {state.singleBlocked && (
        <Hint id="plan-single-hint">
          À vista indisponível: as parcelas já pagas não somam o total.
        </Hint>
      )}
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
          <div
            key={field.id}
            role="group"
            aria-label={`Parcela ${index + 1}`}
            className={styles.instalment}
          >
            <TextField
              form={form}
              name={`plan.rows.${index}.month`}
              label={`Mês da parcela ${index + 1}`}
              type="month"
              disabled={paidOn !== null}
              describedBy={paidOn !== null ? `${field.id}-paid` : undefined}
            />
            <TextField
              form={form}
              name={`plan.rows.${index}.amount`}
              label={`Valor da parcela ${index + 1}`}
              adornment="R$"
              inputMode="decimal"
              format={moneyText}
              disabled={paidOn !== null}
              describedBy={paidOn !== null ? `${field.id}-paid` : undefined}
              onEdit={state.markPlanEdited}
            />
            {paidOn !== null && (
              <p id={`${field.id}-paid`} className={styles.paidOn}>
                paga em {formatIsoDate(paidOn).slice(0, 5)}
              </p>
            )}
          </div>
        );
      })}
      <p aria-live="polite" className={styles.row}>
        {difference > 0 && `Faltam ${formatBrl(difference)}`}
        {difference < 0 && `Excede em ${formatBrl(-difference)}`}
      </p>
      {serverError && (
        <div className={styles.row}>
          <Banner tone="error">{serverError}</Banner>
        </div>
      )}
    </FormSection>
  );
}
