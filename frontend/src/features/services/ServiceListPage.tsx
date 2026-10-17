import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, type ServiceOut } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { serviceKeys } from "../../api/keys";
import { useArchiveService, useRestoreService, useServices } from "../../api/services";
import { formatBrl } from "../../domain/money";
import {
  Banner,
  Button,
  Checkbox,
  type Column,
  EmptyState,
  Loading,
  PageLayout,
  Table,
  useToast,
} from "../../ui";
import { ServiceDialog } from "./ServiceDialog";
import styles from "./ServiceListPage.module.css";
import { ARCHIVE_CONFLICT, RESTORE_CONFLICT, SERVICE_GONE } from "./messages";

export function ServiceListPage() {
  const notify = useToast();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ServiceOut | "new" | null>(null);
  const services = useServices(showArchived);
  const archive = useArchiveService();
  const restore = useRestoreService();

  const onRowError = (conflictText: string) => (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 409) notify(conflictText, { tone: "error" });
    else if (error.status === 404) notify(SERVICE_GONE, { tone: "error" });
    else if (!isUnexpected(error)) notify(describeUnexpected(error), { tone: "error" });
    void queryClient.invalidateQueries({ queryKey: serviceKeys.all });
  };

  const newService = (
    <Button variant="primary" onClick={() => setEditing("new")}>
      Novo serviço
    </Button>
  );

  const columns: Column<ServiceOut>[] = [
    {
      header: "Nome",
      wrap: true,
      cell: (service) => (
        <>
          {service.name}
          {service.archived_at && <span className={styles.tag}> · Arquivado</span>}
        </>
      ),
    },
    {
      header: "Preço padrão",
      align: "end",
      cell: (service) => formatBrl(service.default_price_cents),
    },
    { header: "Pré-wedding", cell: (service) => (service.is_prewedding ? "Sim" : "Não") },
    {
      header: "Ações",
      actions: true,
      align: "end",
      cell: (service) =>
        service.archived_at ? (
          <Button
            onClick={() =>
              restore.mutate(service.id, {
                onSuccess: () => notify("Serviço restaurado"),
                onError: onRowError(RESTORE_CONFLICT),
              })
            }
            busy={restore.isPending && restore.variables === service.id}
          >
            Restaurar
          </Button>
        ) : (
          <span className={styles.actions}>
            <Button onClick={() => setEditing(service)}>Editar</Button>
            <Button
              onClick={() =>
                archive.mutate(service.id, {
                  onSuccess: () => notify("Serviço arquivado"),
                  onError: onRowError(ARCHIVE_CONFLICT),
                })
              }
              busy={archive.isPending && archive.variables === service.id}
            >
              Arquivar
            </Button>
          </span>
        ),
    },
  ];

  return (
    <PageLayout title="Serviços" actions={newService}>
      <div className={styles.toolbar}>
        <Checkbox label="Mostrar arquivados" checked={showArchived} onChange={setShowArchived} />
      </div>
      {services.isPending && <Loading />}
      {services.isError && (
        <Banner tone="error">
          Não foi possível carregar os serviços.{" "}
          <Button onClick={() => void services.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {services.isSuccess && (
        <Table
          label="Serviços"
          columns={columns}
          rows={services.data}
          rowKey={(service) => service.id}
          rowMuted={(service) => service.archived_at !== null}
          empty={<EmptyState action={newService}>Nenhum serviço ainda</EmptyState>}
        />
      )}
      {editing !== null && (
        <ServiceDialog
          key={editing === "new" ? "new" : `${editing.id}-${editing.version}`}
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageLayout>
  );
}
