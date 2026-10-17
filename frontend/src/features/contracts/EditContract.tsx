import { useState } from "react";
import { ApiError, type ContractPatch } from "../../api/client";
import {
  useContract,
  useDownloadPdf,
  useRestoreContract,
  useUpdateContract,
} from "../../api/contracts";
import { useServices } from "../../api/services";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { formatIsoDate } from "../../domain/dates";
import { changedSections } from "../../domain/patch";
import {
  Banner,
  Button,
  ConfirmDialog,
  Hint,
  Loading,
  PageLayout,
  TextLink,
  useToast,
} from "../../ui";
import { ContractForm } from "./ContractForm";
import { type ContractFormValues, fromContract, planFollowsTotal, toRequest } from "./formModel";
import { CONTRACT_GONE, EDIT_CONFLICT_DELETED, PDF_DELETED, RESTORE_CONFLICT } from "./messages";
import { coupleLabel } from "./names";
import { preweddingServiceIds } from "./serviceOptions";

const PDF_HINT_ID = "pdf-save-first-hint";

export function EditContract({ id }: { id: string }) {
  const contract = useContract(id);
  const update = useUpdateContract(id);
  const restore = useRestoreContract();
  const pdf = useDownloadPdf();
  const notify = useToast();
  const [conflict, setConflict] = useState(false);
  const services = useServices(true);
  const [pendingRemoval, setPendingRemoval] = useState<ContractPatch | null>(null);

  const data = contract.data;
  if (data === undefined) {
    if (!contract.isError) {
      return (
        <PageLayout title="Editar contrato">
          <Loading />
        </PageLayout>
      );
    }
    const missing = contract.error instanceof ApiError && contract.error.status === 404;
    return (
      <PageLayout title={missing ? "Contrato não encontrado" : "Editar contrato"}>
        {missing ? (
          <TextLink to="/contratos">Voltar para contratos</TextLink>
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

  const save = async (body: ContractPatch) => {
    try {
      await update.mutateAsync({ version: data.version, body });
      notify("Alterações salvas");
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) return setConflict(true);
      if (error instanceof ApiError && error.code === "prewedding_scheduled") {
        // The cached contract lacks the schedule the server has; same version, so the form keeps its edits.
        void contract.refetch();
        return setPendingRemoval(body);
      }
      if (error instanceof ApiError && error.status === 409) {
        return notify(EDIT_CONFLICT_DELETED, { tone: "error" });
      }
      throw error;
    }
  };

  const submit = async (values: ContractFormValues) => {
    // Sections are compared as API requests, so only real changes are sent.
    const changed = changedSections(toRequest(fromContract(data)), toRequest(values));
    // Sending the plan clears "Revisar plano". Otherwise a plan that only follows a new total
    // is left out, because the server spreads the total over the unpaid instalments the same way.
    if (data.plan_needs_review) changed.instalments = toRequest(values).instalments;
    else if (changed.instalments && planFollowsTotal(data, values)) delete changed.instalments;
    const body = changed as ContractPatch;
    const ids = preweddingServiceIds(services.data ?? []);
    const removesLast =
      data.payment.items.some((item) => ids.has(item.service_id)) &&
      !values.payment.items.some((item) => ids.has(item.service_id));
    if (data.prewedding && removesLast) return setPendingRemoval(body);
    await save(body);
  };

  const confirmRemoval = async () => {
    const body = pendingRemoval;
    if (!body) return;
    try {
      await save({ ...body, cancel_prewedding: true });
    } catch (error) {
      if (error instanceof ApiError && !isUnexpected(error)) {
        notify(describeUnexpected(error), { tone: "error" });
      }
    } finally {
      setPendingRemoval(null);
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
        // A plan waiting for review can be confirmed as it is.
        requireChanges={!data.plan_needs_review}
        planNeedsReview={data.plan_needs_review}
        prewedding={data.prewedding}
        actions={({ hasChanges }) => (
          <>
            <Button
              onClick={downloadPdf}
              disabled={hasChanges}
              busy={pdf.isPending}
              aria-describedby={hasChanges ? PDF_HINT_ID : undefined}
            >
              Baixar PDF
            </Button>
            {hasChanges && <Hint id={PDF_HINT_ID}>Salve as alterações antes de baixar o PDF.</Hint>}
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
      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Cancelar pré-wedding?"
        confirmLabel="Remover e salvar"
        cancelLabel="Voltar"
        tone="danger"
        busy={update.isPending}
        onConfirm={() => void confirmRemoval()}
        onCancel={() => setPendingRemoval(null)}
      >
        <p>
          {data.prewedding
            ? `Este contrato tem um pré-wedding agendado em ${formatIsoDate(data.prewedding.date)}.`
            : "Este contrato tem um pré-wedding agendado."}{" "}
          Remover o item cancela esse agendamento.
        </p>
      </ConfirmDialog>
    </PageLayout>
  );
}
