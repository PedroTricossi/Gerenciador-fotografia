import { type FormEvent, useRef, useState } from "react";
import {
  type ExpenseEventOut,
  type ExpenseOut,
  type ExpenseTypeOut,
  ApiError,
} from "../../../api/client";
import { describeUnexpected, isUnexpected } from "../../../api/errors";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useExpenseEvents,
  useExpenseTypes,
  useUpdateExpense,
} from "../../../api/expenses";
import { todayIso } from "../../../domain/dates";
import { byCloseness, transportKindLabel } from "../../../domain/expenses";
import { splitFieldErrors } from "../../../domain/problems";
import {
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  DialogActions,
  Field,
  FormSection,
  Hint,
  Loading,
  Select,
  TextInput,
  useToast,
} from "../../../ui";
import { coupleLabel } from "../../contracts/names";
import {
  type ExpenseErrors,
  type ExpenseFormValues,
  emptyExpenseValues,
  eventKey,
  fieldFor,
  fromExpense,
  isTransport,
  toRequest,
  validateExpense,
} from "./expenseForm";
import styles from "./ExpenseDialog.module.css";

const TRANSPORT_KINDS = ["car", "ride_app", "bus", "plane", "other"] as const;
const EVENT_WORD = { wedding: "casamento", prewedding: "pré-wedding" } as const;
const CHANGED =
  "Esta despesa foi alterada em outro lugar. Feche e abra de novo para ver a versão atual.";
const GONE = "Esta despesa não existe mais. A lista foi atualizada.";

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function eventLabel(event: ExpenseEventOut): string {
  const couple = coupleLabel({ full_name: event.groom_name }, { full_name: event.bride_name });
  return `${couple} · ${EVENT_WORD[event.event_kind]} ${shortDate(event.date)}`;
}

type Props = {
  /** The stored expense to edit, or null for a new one. */
  expenseId: string | null;
  onClose: () => void;
};

export function ExpenseDialog({ expenseId, onClose }: Props) {
  const title = expenseId ? "Editar despesa" : "Nova despesa";
  const types = useExpenseTypes({ includeArchived: true });
  const events = useExpenseEvents();
  const expense = useExpense(expenseId);
  const queries = expenseId ? [types, events, expense] : [types, events];
  const failed = queries.some((query) => query.isError);
  const ready = types.data && events.data && (!expenseId || expense.data);

  return (
    <Dialog open title={title} onClose={onClose}>
      {failed && (
        <>
          <Banner tone="error">Não foi possível carregar os dados da despesa.</Banner>
          <DialogActions>
            <Button onClick={onClose}>Fechar</Button>
          </DialogActions>
        </>
      )}
      {!failed && !ready && <Loading />}
      {!failed && ready && (
        <ExpenseForm
          expense={expenseId ? (expense.data ?? null) : null}
          types={types.data}
          events={events.data}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

type FormProps = {
  expense: ExpenseOut | null;
  types: ExpenseTypeOut[];
  events: ExpenseEventOut[];
  onClose: () => void;
};

function ExpenseForm({ expense, types, events, onClose }: FormProps) {
  const notify = useToast();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    expense ? fromExpense(expense) : emptyExpenseValues(todayIso()),
  );
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  const busy = create.isPending || update.isPending || remove.isPending;

  const set = (patch: Partial<ExpenseFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const typeOptions = types.filter((type) => !type.archived_at || type.id === expense?.type_id);
  const transport = isTransport(values.typeId, types);
  const hadTrip = expense?.trip != null;
  const droppingTrip = hadTrip && !transport;

  const ordered = byCloseness(events, values.spentOn || todayIso());
  const chosen = ordered.find(
    (event) => eventKey(event.contract_id, event.event_kind) === values.eventKey,
  );
  const dangling =
    values.eventKey !== "" && !chosen
      ? events.some((event) => values.eventKey.startsWith(`${event.contract_id}:`))
        ? "(pré-wedding cancelado)"
        : "(contrato excluído)"
      : null;

  const fail = async (action: () => Promise<unknown>, done: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBanner(null);
    try {
      await action();
      notify(done);
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // The banner sits in the form, behind a confirmation that would otherwise stay open.
      setConfirming(false);
      if (error.status === 412) setBanner(CHANGED);
      else if (error.status === 404) setBanner(GONE);
      else if (error.status === 422) {
        const { fields, other } = splitFieldErrors(error.errors, (path) => fieldFor(path) !== null);
        const mapped: ExpenseErrors = {};
        for (const [path, message] of Object.entries(fields)) mapped[fieldFor(path)!] = message;
        setErrors(mapped);
        const nothingMapped = other.length === 0 && Object.keys(fields).length === 0;
        if (nothingMapped) setBanner(error.detail || "Revise os campos do formulário.");
        else if (other.length > 0) setBanner(other.join(" "));
      } else if (!isUnexpected(error)) setBanner(describeUnexpected(error));
    } finally {
      inFlight.current = false;
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validateExpense(values, types);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    const body = toRequest(values, types);
    void fail(
      () =>
        expense
          ? update.mutateAsync({ id: expense.id, version: expense.version, body })
          : create.mutateAsync(body),
      "Despesa salva",
    );
  };

  const confirmDelete = () => {
    if (!expense) return;
    void fail(
      () => remove.mutateAsync({ id: expense.id, version: expense.version }),
      "Despesa excluída",
    );
  };

  // A save that finishes late would close whichever dialog is open by then.
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <>
      <form noValidate onSubmit={submit}>
        {banner && <Banner tone="error">{banner}</Banner>}
        <Field label="Data" error={errors.spentOn}>
          {(control) => (
            <TextInput
              {...control}
              type="date"
              value={values.spentOn}
              onChange={(event) => set({ spentOn: event.target.value })}
            />
          )}
        </Field>
        <Field label="Valor" error={errors.amount}>
          {(control) => (
            <TextInput
              {...control}
              value={values.amount}
              adornment="R$"
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => set({ amount: event.target.value })}
            />
          )}
        </Field>
        <Field label="Tipo" error={errors.typeId}>
          {(control) => (
            <Select
              {...control}
              value={values.typeId}
              onChange={(event) => set({ typeId: event.target.value })}
            >
              <option value="">Escolha o tipo</option>
              {typeOptions.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {droppingTrip && <Hint id="trip-erased">Os dados da viagem serão apagados ao salvar.</Hint>}
        <Field
          label="Descrição (opcional)"
          hint="Não escreva CPF ou endereço aqui."
          error={errors.description}
        >
          {(control) => (
            <TextInput
              {...control}
              value={values.description}
              autoComplete="off"
              onChange={(event) => set({ description: event.target.value })}
            />
          )}
        </Field>

        {transport && (
          <FormSection title="Só para transporte">
            <Field label="Casamento ou pré-wedding" error={errors.event}>
              {(control) => (
                <Select
                  {...control}
                  value={values.eventKey}
                  onChange={(event) => set({ eventKey: event.target.value })}
                >
                  <option value="">Nenhum</option>
                  {dangling && <option value={values.eventKey}>{dangling}</option>}
                  {ordered.map((event) => (
                    <option
                      key={eventKey(event.contract_id, event.event_kind)}
                      value={eventKey(event.contract_id, event.event_kind)}
                    >
                      {eventLabel(event)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {chosen && (
              <p className={styles.venue}>
                Endereço do local:{" "}
                {[chosen.venue_name, chosen.venue_address].filter(Boolean).join(", ")} (do contrato)
              </p>
            )}
            <Field label="Meio de transporte" error={errors.transportKind}>
              {(control) => (
                <Select
                  {...control}
                  value={values.transportKind}
                  onChange={(event) => set({ transportKind: event.target.value })}
                >
                  <option value="">Escolha</option>
                  {TRANSPORT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {transportKindLabel(kind)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Saí de casa às" error={errors.leftHomeAt}>
              {(control) => (
                <TextInput
                  {...control}
                  type="time"
                  value={values.leftHomeAt}
                  onChange={(event) => set({ leftHomeAt: event.target.value })}
                />
              )}
            </Field>
            <Field label="Distância (km)" error={errors.distance}>
              {(control) => (
                <TextInput
                  {...control}
                  value={values.distance}
                  inputMode="decimal"
                  autoComplete="off"
                  onChange={(event) => set({ distance: event.target.value })}
                />
              )}
            </Field>
          </FormSection>
        )}

        <DialogActions>
          {expense && (
            <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
              Excluir
            </Button>
          )}
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            Salvar
          </Button>
        </DialogActions>
      </form>
      <ConfirmDialog
        open={confirming}
        title="Excluir esta despesa?"
        confirmLabel="Excluir"
        tone="danger"
        busy={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      >
        <p>Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>
    </>
  );
}
