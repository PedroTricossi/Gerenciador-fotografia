import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, type ClientOut } from "../../api/client";
import { useAnonymiseClient, useClients, useExportClient } from "../../api/clients";
import { clientKeys } from "../../api/keys";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { formatIsoDate } from "../../domain/dates";
import {
  Banner,
  Button,
  type Column,
  ConfirmDialog,
  EmptyState,
  Loading,
  PageLayout,
  Table,
  useToast,
} from "../../ui";
import styles from "./ClientListPage.module.css";

const ANONYMISE_CONFLICT =
  "Este cliente está em um contrato que não foi excluído. Exclua o contrato antes de anonimizar.";
const GONE = "Este cliente não existe mais.";
const ANONYMISED_NAME = "Cliente anonimizado";

export function ClientListPage() {
  const notify = useToast();
  const queryClient = useQueryClient();
  const clients = useClients();
  const exporter = useExportClient();
  const anonymise = useAnonymiseClient();
  const [target, setTarget] = useState<ClientOut | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const rows = clients.data?.pages.flatMap((result) => result.items) ?? [];

  const close = () => {
    setTarget(null);
    setDialogError(null);
  };

  const exportData = (client: ClientOut) => {
    exporter.mutate(client.id, {
      onError: (error) => {
        if (isUnexpected(error)) return;
        if (error instanceof ApiError && error.status === 404) {
          notify(GONE, { tone: "error" });
          void queryClient.invalidateQueries({ queryKey: clientKeys.all });
        } else {
          notify(describeUnexpected(error), { tone: "error" });
        }
      },
    });
  };

  const confirmAnonymise = () => {
    if (!target) return;
    setDialogError(null);
    anonymise.mutate(target.id, {
      onSuccess: () => {
        close();
        notify("Cliente anonimizado com sucesso");
      },
      onError: (error) => {
        if (isUnexpected(error)) return;
        if (error instanceof ApiError && error.status === 409) setDialogError(ANONYMISE_CONFLICT);
        else if (error instanceof ApiError && error.status === 404) setDialogError(GONE);
        else setDialogError(describeUnexpected(error));
      },
    });
  };

  const columns: Column<ClientOut>[] = [
    { header: "Nome", cell: (client) => client.full_name ?? ANONYMISED_NAME },
    { header: "CPF", cell: (client) => client.cpf ?? "—" },
    { header: "Cadastrado em", cell: (client) => formatIsoDate(client.created_at) },
    { header: "Situação", cell: (client) => (client.anonymised_at ? "Anonimizado" : "Ativo") },
    {
      header: "Ações",
      align: "end",
      cell: (client) =>
        client.anonymised_at ? null : (
          <span className={styles.actions}>
            <Button
              onClick={() => exportData(client)}
              busy={exporter.isPending && exporter.variables === client.id}
            >
              Exportar dados
            </Button>
            <Button variant="danger" onClick={() => setTarget(client)}>
              Anonimizar
            </Button>
          </span>
        ),
    },
  ];

  return (
    <PageLayout title="Clientes">
      {clients.isPending && <Loading />}
      {clients.isError && (
        <Banner tone="error">
          Não foi possível carregar os clientes.{" "}
          <Button onClick={() => void clients.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {clients.isSuccess && (
        <Table
          label="Clientes"
          columns={columns}
          rows={rows}
          rowKey={(client) => client.id}
          rowMuted={(client) => client.anonymised_at !== null}
          empty={<EmptyState>Nenhum cliente ainda</EmptyState>}
        />
      )}
      {clients.hasNextPage && (
        <div className={styles.more}>
          <Button onClick={() => void clients.fetchNextPage()} busy={clients.isFetchingNextPage}>
            Carregar mais
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        title="Anonimizar cliente"
        confirmLabel="Anonimizar"
        tone="danger"
        requireText="ANONIMIZAR"
        busy={anonymise.isPending}
        error={dialogError}
        onConfirm={confirmAnonymise}
        onCancel={close}
      >
        <p>
          O nome, o CPF e o endereço de {target?.full_name ?? "este cliente"} serão apagados para
          sempre. Esta ação não pode ser desfeita.
        </p>
      </ConfirmDialog>
    </PageLayout>
  );
}
