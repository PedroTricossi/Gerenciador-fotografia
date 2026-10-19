import { type FormEvent, useState } from "react";
import type { FixedCostOut } from "../../../api/client";
import {
  useDeleteFixedCost,
  useRenameFixedCost,
  useResumeFixedCost,
  useSetFixedCostPrice,
  useStopFixedCost,
} from "../../../api/expenses";
import { currentMonth } from "../../../domain/instalments";
import { Button, ConfirmDialog, Field, TextInput, useToast } from "../../../ui";
import { costPriceLabel } from "./costPrice";
import { monthName } from "../groups";
import styles from "./ExpenseDialogs.module.css";
import { amountFrom, fieldMessage, type useWrite } from "./useWrite";

type Mode = "price" | "stop" | "rename" | "delete";
type Write = ReturnType<typeof useWrite>;

type Props = { cost: FixedCostOut; write: Write };

export function FixedCostRow({ cost, write }: Props) {
  const notify = useToast();
  const [mode, setMode] = useState<Mode | null>(null);
  const resume = useResumeFixedCost();
  const remove = useDeleteFixedCost();
  const { busy, run } = write;
  const today = currentMonth();
  const stopped = cost.end_month !== null;

  const done = (message: string) => {
    notify(message);
    setMode(null);
  };

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.name}>{cost.name}</span>
        <span className={styles.meta}>
          {cost.type_name} · dia {cost.day_of_month} · {costPriceLabel(cost, today)}
          {stopped &&
            ` · parada em ${monthName(cost.end_month!).toLowerCase()} ${cost.end_month!.slice(0, 4)}`}
        </span>
      </div>
      <div className={styles.actions}>
        <Button onClick={() => setMode("price")} disabled={busy}>
          Alterar valor
        </Button>
        {stopped ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run(() => resume.mutateAsync(cost.id)).then(
                (ok) => ok && notify("Despesa retomada"),
              )
            }
          >
            Retomar
          </Button>
        ) : (
          <Button onClick={() => setMode("stop")} disabled={busy}>
            Parar
          </Button>
        )}
        <Button onClick={() => setMode("rename")} disabled={busy}>
          Renomear
        </Button>
        <Button onClick={() => setMode("delete")} disabled={busy}>
          Excluir
        </Button>
      </div>
      {mode === "price" && (
        <PriceForm cost={cost} write={write} onDone={() => done("Valor alterado")} />
      )}
      {mode === "stop" && (
        <StopForm cost={cost} write={write} onDone={() => done("Despesa parada")} />
      )}
      {mode === "rename" && (
        <RenameForm cost={cost} write={write} onDone={() => done("Despesa renomeada")} />
      )}
      <ConfirmDialog
        open={mode === "delete"}
        title="Excluir despesa fixa?"
        confirmLabel="Excluir"
        tone="danger"
        busy={busy}
        onConfirm={() =>
          void run(() => remove.mutateAsync({ id: cost.id, version: cost.version })).then((ok) => {
            // The banner sits behind the confirmation, and the row is about to go.
            if (ok) notify("Despesa excluída");
            setMode(null);
          })
        }
        onCancel={() => setMode(null)}
      >
        <p>Excluir remove esta despesa de todos os meses, inclusive os passados.</p>
      </ConfirmDialog>
    </li>
  );
}

type FormProps = { cost: FixedCostOut; write: Write; onDone: () => void };

function PriceForm({ cost, write, onDone }: FormProps) {
  const set = useSetFixedCostPrice();
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(currentMonth());
  const [errors, setErrors] = useState<{ amount?: string; from?: string }>({});

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
        () => set.mutateAsync({ id: cost.id, from_month: from, amount_cents: parsed.cents }),
        (error) => {
          const message = fieldMessage(error, "from_month");
          if (error.status === 422 && message) setErrors({ from: message });
          return error.status === 422 && Boolean(message);
        },
      )
      .then((ok) => ok && onDone());
  };

  return (
    <form noValidate onSubmit={submit} className={styles.inline}>
      <Field label="Novo valor" error={errors.amount}>
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
      <Button type="submit" variant="primary" busy={write.busy}>
        Salvar
      </Button>
    </form>
  );
}

function StopForm({ cost, write, onDone }: FormProps) {
  const stop = useStopFixedCost();
  const [last, setLast] = useState(currentMonth());
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    if (last === "") return setError("campo obrigatório");
    setError(undefined);
    void write
      .run(
        () => stop.mutateAsync({ id: cost.id, endMonth: last }),
        (failure) => {
          const message = fieldMessage(failure, "end_month");
          if (failure.status === 422 && message) setError(message);
          return failure.status === 422 && Boolean(message);
        },
      )
      .then((ok) => ok && onDone());
  };

  return (
    <form noValidate onSubmit={submit} className={styles.inline}>
      <Field label="Último mês" error={error}>
        {(control) => (
          <TextInput
            {...control}
            type="month"
            value={last}
            onChange={(event) => setLast(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" busy={write.busy}>
        Salvar
      </Button>
    </form>
  );
}

function RenameForm({ cost, write, onDone }: FormProps) {
  const rename = useRenameFixedCost();
  const [name, setName] = useState(cost.name);
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    if (name.trim() === "") return setError("campo obrigatório");
    setError(undefined);
    void write
      .run(() => rename.mutateAsync({ id: cost.id, version: cost.version, name: name.trim() }))
      .then((ok) => ok && onDone());
  };

  return (
    <form noValidate onSubmit={submit} className={styles.inline}>
      <Field label="Novo nome" error={error}>
        {(control) => (
          <TextInput
            {...control}
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" busy={write.busy}>
        Salvar
      </Button>
    </form>
  );
}
