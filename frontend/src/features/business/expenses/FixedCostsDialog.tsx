import { type FormEvent, useState } from "react";
import type { ExpenseTypeOut } from "../../../api/client";
import { useCreateFixedCost, useExpenseTypes, useFixedCosts } from "../../../api/expenses";
import { currentMonth } from "../../../domain/instalments";
import {
  Banner,
  Button,
  Dialog,
  DialogActions,
  EmptyState,
  Field,
  FormSection,
  Loading,
  Select,
  TextInput,
  useToast,
} from "../../../ui";
import styles from "./ExpenseDialogs.module.css";
import { FixedCostRow } from "./FixedCostRow";
import { amountFrom, fieldMessage, useWrite } from "./useWrite";

type Props = { onClose: () => void };

export function FixedCostsDialog({ onClose }: Props) {
  const costs = useFixedCosts();
  const types = useExpenseTypes({ includeArchived: false });
  const write = useWrite();
  const failed = costs.isError || types.isError;

  return (
    <Dialog open title="Despesas fixas" onClose={onClose} dismissable={!write.busy}>
      {write.banner && <Banner tone="error">{write.banner}</Banner>}
      {failed && <Banner tone="error">Não foi possível carregar as despesas fixas.</Banner>}
      {!failed && (!costs.data || !types.data) && <Loading />}
      {costs.data && types.data && (
        <>
          {costs.data.length === 0 ? (
            <EmptyState>Nenhuma despesa fixa ainda.</EmptyState>
          ) : (
            <ul className={styles.list}>
              {costs.data.map((cost) => (
                <FixedCostRow key={cost.id} cost={cost} write={write} />
              ))}
            </ul>
          )}
          <NewCostForm types={types.data} write={write} />
        </>
      )}
      <DialogActions>
        <Button onClick={onClose} disabled={write.busy}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type Errors = Partial<Record<"name" | "day" | "start" | "amount", string>>;

function NewCostForm({
  types,
  write,
}: {
  types: ExpenseTypeOut[];
  write: ReturnType<typeof useWrite>;
}) {
  const notify = useToast();
  const create = useCreateFixedCost();
  const options = types.filter((type) => !type.archived_at && type.key !== "second_photographer");
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState(
    () => (options.find((type) => type.name === "Assinatura") ?? options[0])?.id ?? "",
  );
  const [day, setDay] = useState("");
  const [start, setStart] = useState(currentMonth());
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    const parsed = amountFrom(amount);
    const dayNumber = Number(day);
    const found: Errors = {};
    if (name.trim() === "") found.name = "campo obrigatório";
    if (day.trim() === "") found.day = "campo obrigatório";
    else if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31)
      found.day = "Use um dia entre 1 e 31.";
    if (start === "") found.start = "campo obrigatório";
    if ("error" in parsed) found.amount = parsed.error;
    setErrors(found);
    if (Object.keys(found).length > 0 || "error" in parsed) return;
    void write
      .run(
        () =>
          create.mutateAsync({
            name: name.trim(),
            type_id: typeId,
            day_of_month: dayNumber,
            start_month: start,
            amount_cents: parsed.cents,
          }),
        (error) => {
          const mapped: Errors = {};
          const messages: [keyof Errors, string][] = [
            ["name", "name"],
            ["day", "day_of_month"],
            ["start", "start_month"],
            ["amount", "amount_cents"],
          ];
          for (const [field, path] of messages) mapped[field] = fieldMessage(error, path);
          const any = error.status === 422 && Object.values(mapped).some(Boolean);
          if (any) setErrors(mapped);
          return any;
        },
      )
      .then((ok) => {
        if (!ok) return;
        notify("Despesa fixa criada");
        setName("");
        setDay("");
        setAmount("");
        setErrors({});
      });
  };

  return (
    <form noValidate onSubmit={submit}>
      <FormSection title="Nova despesa fixa">
        <Field label="Nome" error={errors.name}>
          {(control) => (
            <TextInput
              {...control}
              value={name}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Tipo">
          {(control) => (
            <Select {...control} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
              {options.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Dia" error={errors.day} size="short">
          {(control) => (
            <TextInput
              {...control}
              value={day}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => setDay(event.target.value)}
            />
          )}
        </Field>
        <Field label="Início" error={errors.start}>
          {(control) => (
            <TextInput
              {...control}
              type="month"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          )}
        </Field>
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
        <Button type="submit" variant="primary" busy={write.busy}>
          Adicionar
        </Button>
      </FormSection>
    </form>
  );
}
