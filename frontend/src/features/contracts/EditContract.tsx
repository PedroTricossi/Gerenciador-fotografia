import { useState } from "react";
import { Link } from "react-router";
import { ApiError, type ContractPatch } from "../../api/client";
import {
  useContract,
  useDownloadPdf,
  useRestoreContract,
  useUpdateContract,
} from "../../api/contracts";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { changedSections } from "../../domain/patch";
import { Banner, Button, ConfirmDialog, PageLayout, useToast } from "../../ui";
import { ContractForm } from "./ContractForm";
import { type ContractFormValues, fromContract, toRequest } from "./formModel";
import { CONTRACT_GONE, EDIT_CONFLICT_DELETED, PDF_DELETED, RESTORE_CONFLICT } from "./messages";
import { coupleLabel } from "./names";

export function EditContract({ id }: { id: string }) {
  const contract = useContract(id);
  const update = useUpdateContract(id);
  const restore = useRestoreContract();
  const pdf = useDownloadPdf();
  const notify = useToast();
  const [conflict, setConflict] = useState(false);

  const data = contract.data;
  if (data === undefined) {
    if (!contract.isError) {
      return (
        <PageLayout title="Editar contrato">
          <p>Carregando…</p>
        </PageLayout>
      );
    }
    const missing = contract.error instanceof ApiError && contract.error.status === 404;
    return (
      <PageLayout title={missing ? "Contrato não encontrado" : "Editar contrato"}>
        {missing ? (
          <p>
            <Link to="/contratos">Voltar para contratos</Link>
          </p>
        ) : (
          <Banner tone="error">
            Não foi possível carregar o contrato.{" "}
            <Button onClick={() => void contract.refetch()}>Tentar de novo</Button>
          </Banner>
        )}
      </PageLayout>
    );
  }

  const deleted = data.deleted_at !== null;

  const submit = async (values: ContractFormValues) => {
    // Sections are compared as API requests, so only real changes are sent.
    const body = changedSections(toRequest(fromContract(data)), toRequest(values)) as ContractPatch;
    try {
      await update.mutateAsync({ version: data.version, body });
      notify("Alterações salvas");
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) return setConflict(true);
      if (error instanceof ApiError && error.status === 409) {
        return notify(EDIT_CONFLICT_DELETED, { tone: "error" });
      }
      throw error;
    }
  };

  /** Handled statuses get a Portuguese text; other expected errors are shown, unexpected ones are toasted globally. */
  const reportFailure = (error: unknown, conflictText: string) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 409) notify(conflictText, { tone: "error" });
    else if (error.status === 404) notify(CONTRACT_GONE, { tone: "error" });
    else if (!isUnexpected(error)) notify(describeUnexpected(error), { tone: "error" });
  };

  const restoreContract = () =>
    restore.mutate(id, {
      onSuccess: () => notify("Contrato restaurado"),
      onError: (error) => reportFailure(error, RESTORE_CONFLICT),
    });

  const downloadPdf = () =>
    pdf.mutate(id, { onError: (error) => reportFailure(error, PDF_DELETED) });

  return (
    <PageLayout title={coupleLabel(data.groom, data.bride)}>
      {deleted && (
        <Banner tone="info">
          Este contrato foi excluído.{" "}
          <Button onClick={restoreContract} busy={restore.isPending}>
            Restaurar
          </Button>
        </Banner>
      )}
      <ContractForm
        // A new version (after a save or a reload) starts the form afresh from the server's data.
        key={data.version}
        initialValues={fromContract(data)}
        onSubmit={submit}
        readOnly={deleted}
        savedItems={data.payment.items}
        requireChanges
        actions={({ hasChanges }) => (
          <>
            <Button onClick={downloadPdf} disabled={hasChanges} busy={pdf.isPending}>
              Baixar PDF
            </Button>
            {hasChanges && <span>Salve as alterações antes de baixar o PDF.</span>}
          </>
        )}
      />
      <ConfirmDialog
        open={conflict}
        title="Contrato alterado"
        confirmLabel="Recarregar"
        onConfirm={() => {
          setConflict(false);
          void contract.refetch();
        }}
        onCancel={() => setConflict(false)}
      >
        <p>Este contrato foi alterado em outro lugar. Recarregue para ver a versão atual.</p>
      </ConfirmDialog>
    </PageLayout>
  );
}
