import { type FormEvent, useState } from "react";
import { ApiError, type ServiceOut } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { useCreateService, useUpdateService } from "../../api/services";
import { moneyText } from "../contracts/formModel";
import {
  Banner,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  Field,
  TextInput,
  useToast,
} from "../../ui";
import { NAME_TAKEN, SERVICE_CHANGED, SERVICE_GONE } from "./messages";
import {
  type ServiceErrors,
  type ServiceValues,
  emptyServiceValues,
  serviceValues,
  toServiceRequest,
  validateService,
} from "./serviceForm";

type Props = { service: ServiceOut | null; onClose: () => void };

export function ServiceDialog({ service, onClose }: Props) {
  const notify = useToast();
  const create = useCreateService();
  const update = useUpdateService();
  const [values, setValues] = useState<ServiceValues>(() =>
    service ? serviceValues(service) : emptyServiceValues(),
  );
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const set = (patch: Partial<ServiceValues>) => setValues((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validateService(values);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) return;
    const body = toServiceRequest(values);
    try {
      if (service) await update.mutateAsync({ id: service.id, version: service.version, body });
      else await create.mutateAsync(body);
      notify(service ? "Serviço atualizado" : "Serviço criado");
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.status === 409) setErrors({ name: NAME_TAKEN });
      else if (error.status === 412) setBanner(SERVICE_CHANGED);
      else if (error.status === 404) setBanner(SERVICE_GONE);
      else if (error.status === 422) {
        const mapped: ServiceErrors = {};
        const other: string[] = [];
        for (const { field, message } of error.errors) {
          if (field === "name" || field === "default_price_cents") mapped[field] = message;
          else other.push(field ? `${field}: ${message}` : message);
        }
        setErrors(mapped);
        if (other.length > 0) setBanner(other.join(" "));
      } else if (!isUnexpected(error)) setBanner(describeUnexpected(error));
    }
  };

  // A save that finishes late would close whichever dialog is open by then.
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog open title={service ? "Editar serviço" : "Novo serviço"} onClose={close}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        {banner && <Banner tone="error">{banner}</Banner>}
        <Field label="Nome" error={errors.name}>
          {(control) => (
            <TextInput
              {...control}
              value={values.name}
              onChange={(event) => set({ name: event.target.value })}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Preço padrão" error={errors.default_price_cents}>
          {(control) => (
            <TextInput
              {...control}
              value={values.price}
              adornment="R$"
              inputMode="decimal"
              onChange={(event) => set({ price: event.target.value })}
              onBlur={(event) => set({ price: moneyText(event.target.value) })}
              autoComplete="off"
            />
          )}
        </Field>
        <Checkbox
          label="Ensaio de pré-wedding"
          checked={values.isPrewedding}
          onChange={(checked) => set({ isPrewedding: checked })}
        />
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
