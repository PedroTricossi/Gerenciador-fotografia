import { type FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, type ExpenseEntryOut } from "../../../api/client";
import {
  expenseKeys,
  useClearContractFee,
  useSecondPhotographerFee,
  useSetContractFee,
  useSetSecondPhotographerFee,
} from "../../../api/expenses";
import { currentMonth } from "../../../domain/instalments";
import { formatBrl, formatBrlAmount } from "../../../domain/money";
import {
  Banner,
  Button,
  Dialog,
  DialogActions,
  Field,
  Loading,
  TextInput,
  useToast,
} from "../../../ui";
import { coupleLabel } from "../../contracts/names";
import { monthName } from "../groups";
import styles from "./ExpenseDialogs.module.css";
import {
  amountFrom,
  fieldMessage,
  STANDARD_MESSAGES,
  useWrite,
  WEDDING_MESSAGES,
} from "./useWrite";

const NO_SECOND = "Este casamento não tem mais 2 fotógrafos.";
const DELETED = "Este contrato foi excluído.";

type Props =
  | { mode: "standard"; onClose: () => void }
  | { mode: "adjust"; entry: ExpenseEntryOut; onClose: () => void };

export function FeeDialog(props: Props) {
  const write = useWrite(props.mode === "adjust" ? WEDDING_MESSAGES : STANDARD_MESSAGES);
  const title =
    props.mode === "standard" ? "2º fotógrafo (padrão)" : `2º fotógrafo · ${couple(props.entry)}`;
  return (
    <Dialog open title={title} onClose={props.onClose} dismissable={!write.busy}>
      {write.banner && <Banner tone="error">{write.banner}</Banner>}
      {props.mode === "standard" ? (
        <StandardFee write={write} onClose={props.onClose} />
      ) : (
        <ContractFee entry={props.entry} write={write} onClose={props.onClose} />
      )}
    </Dialog>
  );
}

function couple(entry: ExpenseEntryOut): string {
  return coupleLabel({ full_name: entry.groom_name }, { full_name: entry.bride_name });
}

type Write = ReturnType<typeof useWrite>;

function StandardFee({ write, onClose }: { write: Write; onClose: () => void }) {
  const notify = useToast();
  const fee = useSecondPhotographerFee();
  const set = useSetSecondPhotographerFee();
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(currentMonth());
  const [errors, setErrors] = useState<{ amount?: string; from?: string }>({});

  if (fee.isError) return <Banner tone="error">Não foi possível carregar o valor padrão.</Banner>;
  if (!fee.data) return <Loading />;
  const history = [...fee.data.prices].sort((a, b) => b.from_month.localeCompare(a.from_month));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    const parsed = amountFrom(amount);
    const found = {
      amount: "error" in parsed ? parsed.error : undefined,
      from: from === "" ? "campo obrigatório" : undefined,
    };
    setErrors(found);
    if ("error" in parsed || found.from) return;
    void write
      .run(
        () => set.mutateAsync({ from_month: from, amount_cents: parsed.cents }),
        (error) => {
          const message = fieldMessage(error, "from_month");
          if (error.status === 422 && message) setErrors({ from: message });
          return error.status === 422 && Boolean(message);
        },
      )
      .then((ok) => {
        if (!ok) return;
        notify("Valor padrão alterado");
        onClose();
      });
  };

  return (
    <>
      {history.length > 0 && (
        <ul className={styles.list}>
          {history.map((price) => (
            <li key={price.from_month} className={styles.head}>
              <span>
                a partir de {monthName(price.from_month).toLowerCase()}{" "}
                {price.from_month.slice(0, 4)}
              </span>
              <span className={styles.name}>{formatBrl(price.amount_cents)}</span>
            </li>
          ))}
        </ul>
      )}
      <form noValidate onSubmit={submit}>
        <Field label="Valor" error={errors.amount}>
          {(control) => (
            <TextInput
              {...control}
              value={amount}
              adornment="R$"
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        <Field label="A partir de" error={errors.from}>
          {(control) => (
            <TextInput
              {...control}
              type="month"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <DialogActions>
          <Button onClick={onClose} disabled={write.busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={write.busy}>
            Salvar
          </Button>
        </DialogActions>
      </form>
    </>
  );
}

function ContractFee({
  entry,
  write,
  onClose,
}: {
  entry: ExpenseEntryOut;
  write: Write;
  onClose: () => void;
}) {
  const notify = useToast();
  const client = useQueryClient();
  const set = useSetContractFee();
  const clear = useClearContractFee();
  const contractId = entry.contract_id ?? "";
  const [amount, setAmount] = useState(
    entry.missing_amount ? "" : formatBrlAmount(entry.amount_cents),
  );
  const [error, setError] = useState<string>();

  // Both writes fail the same way when the wedding lost its second photographer.
  const conflict = (failure: ApiError) => {
    if (failure.status !== 409) return false;
    void client.invalidateQueries({ queryKey: expenseKeys.all });
    write.setBanner(failure.code === "contract_deleted" ? DELETED : NO_SECOND);
    return true;
  };
  const finish = (message: string) => (ok: boolean) => {
    if (!ok) return;
    notify(message);
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    const parsed = amountFrom(amount);
    setError("error" in parsed ? parsed.error : undefined);
    if ("error" in parsed) return;
    // Ajustar pre-fills the standard: saving it untouched would pin this wedding to today's
    // standard and shield it from later changes.
    if (!entry.override && !entry.missing_amount && parsed.cents === entry.amount_cents)
      return onClose();
    void write
      .run(() => set.mutateAsync({ contractId, amountCents: parsed.cents }), conflict)
      .then(finish("Valor do casamento salvo"));
  };

  return (
    <form noValidate onSubmit={submit}>
      <Field label="Valor para este casamento" error={error}>
        {(control) => (
          <TextInput
            {...control}
            value={amount}
            adornment="R$"
            inputMode="decimal"
            autoComplete="off"
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
      </Field>
      <DialogActions>
        {entry.override && (
          <Button
            disabled={write.busy}
            onClick={() =>
              void write
                .run(() => clear.mutateAsync(contractId), conflict)
                .then(finish("Voltou ao valor padrão"))
            }
          >
            Usar o padrão
          </Button>
        )}
        <Button onClick={onClose} disabled={write.busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" busy={write.busy}>
          Salvar
        </Button>
      </DialogActions>
    </form>
  );
}
