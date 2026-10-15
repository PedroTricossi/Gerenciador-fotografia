import { type FormEvent, useState } from "react";
import { ApiError, type ContractOut } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { useCancelPrewedding, useSchedulePrewedding } from "../../api/prewedding";
import { formatIsoDate } from "../../domain/dates";
import { Banner, Button, Dialog, DialogActions, Field, TextInput, useToast } from "../../ui";
import { NOT_FOUND_IN_LIST, PREWEDDING_ALREADY_CANCELLED, PREWEDDING_CHANGED } from "./messages";
import { coupleLabel } from "./names";
import {
  type PreweddingErrors,
  type PreweddingValues,
  emptyPrewedding,
  preweddingValues,
  toPreweddingRequest,
  validatePrewedding,
} from "./preweddingForm";

type Props = { contract: ContractOut; onClose: () => void };

const FIELDS: {
  key: keyof PreweddingValues;
  label: string;
  type: "date" | "time" | "text";
  hint?: string;
}[] = [
  { key: "date", label: "Data", type: "date" },
  { key: "venue_name", label: "Local", type: "text" },
  { key: "venue_address", label: "Endereço", type: "text", hint: "Opcional" },
  { key: "start_time", label: "Horário", type: "time", hint: "Opcional" },
];

const valuesOf = (contract: ContractOut) =>
  contract.prewedding ? preweddingValues(contract.prewedding) : emptyPrewedding();

/** `contract` is the list's current row, so a retry after a reload uses the fresh version. */
export function PreweddingDialog({ contract, onClose }: Props) {
  const notify = useToast();
  const schedule = useSchedulePrewedding();
  const cancel = useCancelPrewedding();
  const [values, setValues] = useState(() => valuesOf(contract));
  const [errors, setErrors] = useState<PreweddingErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The version a 412 was answered for; undefined when no reload is awaited.
  const [staleVersion, setStaleVersion] = useState<number | null | undefined>(undefined);
  const busy = schedule.isPending || cancel.isPending;
  const current = contract.prewedding;

  // Once the refetched row arrives, show what is stored now (state adjusted during render).
  if (staleVersion !== undefined && (current?.version ?? null) !== staleVersion) {
    setStaleVersion(undefined);
    setValues(valuesOf(contract));
  }

  const fail = (error: unknown, notFound: string) => {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 412 || error.status === 428) {
      setBanner(PREWEDDING_CHANGED);
      setStaleVersion(current?.version ?? null);
    } else if (error.status === 404) {
      notify(notFound, { tone: "error" });
      onClose();
    } else if (error.status === 409) setBanner(error.detail);
    else if (error.status === 422) {
      const mapped: PreweddingErrors = {};
      const other: string[] = [];
      for (const { field, message } of error.errors) {
        if (FIELDS.some(({ key }) => key === field))
          mapped[field as keyof PreweddingValues] = message;
        else other.push(field ? `${field}: ${message}` : message);
      }
      setErrors(mapped);
      if (other.length > 0) setBanner(other.join(" "));
    } else if (!isUnexpected(error)) setBanner(describeUnexpected(error));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validatePrewedding(values);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    try {
      await schedule.mutateAsync({
        contractId: contract.id,
        version: current?.version ?? null,
        body: toPreweddingRequest(values),
      });
      notify(current ? "Pré-wedding atualizado" : "Pré-wedding agendado");
      onClose();
    } catch (error) {
      fail(error, NOT_FOUND_IN_LIST);
    }
  };

  const unschedule = async () => {
    if (!current || busy) return;
    try {
      await cancel.mutateAsync({ contractId: contract.id, version: current.version });
      notify("Pré-wedding desmarcado");
      onClose();
    } catch (error) {
      setConfirming(false);
      fail(error, PREWEDDING_ALREADY_CANCELLED);
    }
  };

  // A save that finishes late would close whichever dialog is open by then.
  const close = () => {
    if (!busy) onClose();
  };

  const set = (key: keyof PreweddingValues, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <Dialog open title="Pré-wedding" onClose={close}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <p>{coupleLabel(contract.groom, contract.bride)}</p>
        {banner && <Banner tone="error">{banner}</Banner>}
        {FIELDS.map(({ key, label, type, hint }) => (
          <Field key={key} label={label} hint={hint} error={errors[key]}>
            {(control) => (
              <TextInput
                {...control}
                type={type}
                value={values[key]}
                onChange={(event) => set(key, event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
        ))}
        {confirming && current ? (
          <>
            <Banner tone="info">Desmarcar o pré-wedding de {formatIsoDate(current.date)}?</Banner>
            <DialogActions>
              <Button onClick={() => setConfirming(false)} disabled={busy}>
                Voltar
              </Button>
              <Button variant="danger" onClick={() => void unschedule()} busy={busy}>
                Desmarcar
              </Button>
            </DialogActions>
          </>
        ) : (
          <DialogActions>
            {current && (
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>
                Desmarcar pré-wedding
              </Button>
            )}
            <Button onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" busy={busy}>
              Salvar
            </Button>
          </DialogActions>
        )}
      </form>
    </Dialog>
  );
}
