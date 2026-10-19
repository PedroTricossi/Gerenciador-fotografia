import { type FormEvent, useState } from "react";
import type { ExpenseTypeOut } from "../../../api/client";
import {
  useArchiveExpenseType,
  useCreateExpenseType,
  useExpenseTypes,
  useRenameExpenseType,
  useRestoreExpenseType,
} from "../../../api/expenses";
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
import styles from "./ExpenseDialogs.module.css";
import { TYPE_MESSAGES, useWrite } from "./useWrite";

const DUPLICATE = "Já existe um tipo com esse nome.";

type Write = ReturnType<typeof useWrite>;

export function ExpenseTypesDialog({ onClose }: { onClose: () => void }) {
  const types = useExpenseTypes({ includeArchived: true });
  const write = useWrite(TYPE_MESSAGES);
  const active = types.data?.filter((type) => !type.archived_at) ?? [];
  const archived = types.data?.filter((type) => type.archived_at) ?? [];

  return (
    <Dialog open title="Tipos de despesa" onClose={onClose} dismissable={!write.busy}>
      {write.banner && <Banner tone="error">{write.banner}</Banner>}
      {types.isError && <Banner tone="error">Não foi possível carregar os tipos.</Banner>}
      {types.isPending && <Loading />}
      {types.data && (
        <>
          <ul className={styles.list}>
            {active.map((type) => (
              <TypeRow key={type.id} type={type} write={write} />
            ))}
          </ul>
          {archived.length > 0 && (
            <>
              <h3 className={styles.heading}>Arquivados</h3>
              <ul className={styles.list}>
                {archived.map((type) => (
                  <TypeRow key={type.id} type={type} write={write} />
                ))}
              </ul>
            </>
          )}
          <NewTypeForm write={write} />
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

function TypeRow({ type, write }: { type: ExpenseTypeOut; write: Write }) {
  const notify = useToast();
  const archive = useArchiveExpenseType();
  const restore = useRestoreExpenseType();
  const rename = useRenameExpenseType();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(type.name);
  const [error, setError] = useState<string>();
  const archived = type.archived_at !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    if (name.trim() === "") return setError("campo obrigatório");
    setError(undefined);
    void write
      .run(
        () => rename.mutateAsync({ id: type.id, version: type.version, name: name.trim() }),
        (failure) => {
          if (failure.status !== 409) return false;
          setError(DUPLICATE);
          return true;
        },
      )
      .then((ok) => {
        if (!ok) return;
        notify("Tipo renomeado");
        setRenaming(false);
      });
  };

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.name}>{type.name}</span>
        {type.key && <span className={styles.meta}>usado pelo sistema</span>}
      </div>
      <div className={styles.actions}>
        <Button onClick={() => setRenaming(true)} disabled={write.busy}>
          Renomear
        </Button>
        {archived ? (
          <Button
            disabled={write.busy}
            onClick={() => void write.run(() => restore.mutateAsync(type.id))}
          >
            Restaurar
          </Button>
        ) : (
          !type.key && (
            <Button
              disabled={write.busy}
              onClick={() => void write.run(() => archive.mutateAsync(type.id))}
            >
              Arquivar
            </Button>
          )
        )}
      </div>
      {renaming && (
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
      )}
    </li>
  );
}

function NewTypeForm({ write }: { write: Write }) {
  const notify = useToast();
  const create = useCreateExpenseType();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (write.busy) return;
    if (name.trim() === "") return setError("campo obrigatório");
    setError(undefined);
    void write
      .run(
        () => create.mutateAsync({ name: name.trim() }),
        (failure) => {
          if (failure.status !== 409) return false;
          setError(DUPLICATE);
          return true;
        },
      )
      .then((ok) => {
        if (!ok) return;
        notify("Tipo criado");
        setName("");
      });
  };

  return (
    <form noValidate onSubmit={submit} className={styles.inline}>
      <Field label="Novo tipo" error={error}>
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
        Adicionar
      </Button>
    </form>
  );
}
