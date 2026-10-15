import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, type ContractOut } from "../../api/client";
import {
  contractKeys,
  useContracts,
  useDeleteContract,
  useDownloadPdf,
  useRestoreContract,
} from "../../api/contracts";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { formatIsoDate } from "../../domain/dates";
import { formatBrl } from "../../domain/money";
import {
  Banner,
  Button,
  Checkbox,
  type Column,
  ConfirmDialog,
  PageLayout,
  Table,
  useToast,
} from "../../ui";
import styles from "./ContractListPage.module.css";
import { DELETE_CONFLICT, NOT_FOUND_IN_LIST, PDF_DELETED, RESTORE_CONFLICT } from "./messages";
import { coupleLabel } from "./names";
import { PreweddingDialog } from "./PreweddingDialog";
import { preweddingButtonLabel } from "./preweddingForm";

export function ContractListPage() {
  const navigate = useNavigate();
  const notify = useToast();
  const client = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContractOut | null>(null);
  const [preweddingFor, setPreweddingFor] = useState<string | null>(null);
  const contracts = useContracts(showDeleted);
  const remove = useDeleteContract();
  const restore = useRestoreContract();
  const pdf = useDownloadPdf();

  const rows = contracts.data?.pages.flatMap((result) => result.items) ?? [];
  const preweddingTarget = rows.find((row) => row.id === preweddingFor) ?? null;

  const failureHandler = (messages: { 404: string; 409: string }) => (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 404 || error.status === 409) {
      notify(messages[error.status], { tone: "error" });
      void client.invalidateQueries({ queryKey: contractKeys.all });
    } else if (!isUnexpected(error)) {
      // Unexpected errors are already toasted globally.
      notify(describeUnexpected(error), { tone: "error" });
    }
  };
  const onDeleteError = failureHandler({ 404: NOT_FOUND_IN_LIST, 409: DELETE_CONFLICT });
  const onRestoreError = failureHandler({ 404: NOT_FOUND_IN_LIST, 409: RESTORE_CONFLICT });
  const onPdfError = failureHandler({ 404: NOT_FOUND_IN_LIST, 409: PDF_DELETED });

  // Promise form: the feedback must survive this page unmounting (the Desfazer toast outlives it).
  const restoreContract = (id: string) =>
    restore
      .mutateAsync(id)
      .then(() => notify("Contrato restaurado"))
      .catch(onRestoreError);

  const confirmDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    remove.mutate(target.id, {
      onSuccess: () =>
        notify("Contrato excluído", {
          action: { label: "Desfazer", onClick: () => void restoreContract(target.id) },
        }),
      onError: onDeleteError,
      onSettled: () => setPendingDelete(null),
    });
  };

  const newContract = (
    <Button variant="primary" onClick={() => navigate("/contratos/novo")}>
      Novo contrato
    </Button>
  );

  const columns: Column<ContractOut>[] = [
    {
      header: "Casal",
      cell: (contract) => (
        <>
          {coupleLabel(contract.groom, contract.bride)}
          {contract.deleted_at && <span className={styles.tag}> · Excluído</span>}
        </>
      ),
    },
    { header: "Data do evento", cell: (contract) => formatIsoDate(contract.event.date) },
    { header: "Local", cell: (contract) => contract.event.venue_name },
    { header: "Total", align: "end", cell: (contract) => formatBrl(contract.payment.total_cents) },
    {
      header: "Ações",
      align: "end",
      cell: (contract) =>
        contract.deleted_at ? (
          <Button
            onClick={() => void restoreContract(contract.id)}
            busy={restore.isPending && restore.variables === contract.id}
          >
            Restaurar
          </Button>
        ) : (
          <span className={styles.actions}>
            {(contract.has_prewedding || contract.prewedding !== null) && (
              <Button onClick={() => setPreweddingFor(contract.id)}>
                {preweddingButtonLabel(contract.prewedding)}
              </Button>
            )}
            <Button onClick={() => navigate(`/contratos/${contract.id}`)}>Editar</Button>
            <Button
              onClick={() => pdf.mutate(contract.id, { onError: onPdfError })}
              busy={pdf.isPending && pdf.variables === contract.id}
            >
              Baixar PDF
            </Button>
            <Button variant="danger" onClick={() => setPendingDelete(contract)}>
              Excluir
            </Button>
          </span>
        ),
    },
  ];

  return (
    <PageLayout title="Contratos" actions={newContract}>
      <div className={styles.toolbar}>
        <Checkbox label="Mostrar excluídos" checked={showDeleted} onChange={setShowDeleted} />
      </div>
      {contracts.isPending && <p>Carregando…</p>}
      {contracts.isError && (
        <Banner tone="error">
          Não foi possível carregar os contratos.{" "}
          <Button onClick={() => void contracts.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {contracts.isSuccess && (
        <Table
          label="Contratos"
          columns={columns}
          rows={rows}
          rowKey={(contract) => contract.id}
          rowMuted={(contract) => contract.deleted_at !== null}
          empty={
            <>
              <p>Nenhum contrato ainda</p>
              {newContract}
            </>
          }
        />
      )}
      {contracts.hasNextPage && (
        <div className={styles.more}>
          <Button
            onClick={() => void contracts.fetchNextPage()}
            busy={contracts.isFetchingNextPage}
          >
            Carregar mais
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir contrato"
        confirmLabel="Excluir"
        tone="danger"
        busy={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          O contrato de {pendingDelete ? coupleLabel(pendingDelete.groom, pendingDelete.bride) : ""}{" "}
          será excluído. Você pode restaurá-lo depois em "Mostrar excluídos".
        </p>
      </ConfirmDialog>
      {preweddingTarget && (
        <PreweddingDialog contract={preweddingTarget} onClose={() => setPreweddingFor(null)} />
      )}
    </PageLayout>
  );
}
