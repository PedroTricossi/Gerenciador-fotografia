import { useId, useState } from "react";
import { useExpenseEntries, useFixedCosts, useSecondPhotographerFee } from "../../../api/expenses";
import type { ExpenseEntryOut } from "../../../api/client";
import { todayIso } from "../../../domain/dates";
import { formatKm, priceInForce, transportKindLabel } from "../../../domain/expenses";
import { addMonths, currentMonth } from "../../../domain/instalments";
import { formatBrl } from "../../../domain/money";
import { Banner, Button, type Column, EmptyState, Loading, Table } from "../../../ui";
import { coupleLabel } from "../../contracts/names";
import { monthName } from "../groups";
import { ExpenseDialog } from "./ExpenseDialog";
import styles from "./ExpensesTab.module.css";

const noop = () => {};

const DANGLING: Record<string, string> = {
  contract_deleted: "(contrato excluído)",
  prewedding_cancelled: "(pré-wedding cancelado)",
};

const EVENT_WORD = { wedding: "casamento", prewedding: "pré-wedding" } as const;

const monthTitle = (month: string) => `${monthName(month).toLowerCase()} ${month.slice(0, 4)}`;

function describe(entry: ExpenseEntryOut): string {
  if (entry.transport_kind && entry.link_state) {
    const place =
      entry.link_state === "ok"
        ? coupleLabel({ full_name: entry.groom_name }, { full_name: entry.bride_name })
        : (DANGLING[entry.link_state] ?? "");
    const event = entry.event_kind ? `${EVENT_WORD[entry.event_kind]} ` : "";
    return [
      transportKindLabel(entry.transport_kind),
      `${event}${place}`,
      entry.distance_tenths === null ? null : formatKm(entry.distance_tenths),
      entry.left_home_at ? `saí ${entry.left_home_at}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return entry.description || entry.type_name;
}

type Props = {
  onEdit?: (entry: ExpenseEntryOut) => void;
  onAdjust?: (entry: ExpenseEntryOut) => void;
  onManage?: () => void;
  onNew?: () => void;
};

export function ExpensesTab({
  onEdit = noop,
  onAdjust = noop,
  onManage = noop,
  onNew = noop,
}: Props) {
  // null: closed; "new": a blank form; otherwise the stored expense being edited.
  const [dialog, setDialog] = useState<"new" | { id: string } | null>(null);
  const today = currentMonth();
  const [month, setMonth] = useState(today);
  const entries = useExpenseEntries(month);
  const fixedCosts = useFixedCosts();
  const fee = useSecondPhotographerFee();
  const settingsId = useId();
  const todayDate = todayIso();

  const openEdit = (entry: ExpenseEntryOut) => {
    onEdit(entry);
    if (entry.expense_id) setDialog({ id: entry.expense_id });
  };

  const columns: Column<ExpenseEntryOut>[] = [
    { header: "Dia", cell: (entry) => entry.date.slice(8, 10) },
    {
      header: "Despesa",
      wrap: true,
      cell: (entry) => (
        <>
          {describe(entry)}
          {entry.source === "fixed" && <span className={styles.tag}>fixa</span>}
          {entry.source === "second_photographer" && <span className={styles.tag}>automática</span>}
          {entry.date > todayDate && <span className={styles.tag}>prevista</span>}
        </>
      ),
    },
    { header: "Tipo", cell: (entry) => entry.type_name },
    {
      header: "Valor",
      align: "end",
      cell: (entry) => (entry.missing_amount ? "— sem valor" : formatBrl(entry.amount_cents)),
    },
    {
      header: "Ações",
      align: "end",
      actions: true,
      cell: (entry) =>
        entry.source === "second_photographer" ? (
          <Button onClick={() => onAdjust(entry)} aria-label={`Ajustar ${describe(entry)}`}>
            Ajustar
          </Button>
        ) : (
          <Button onClick={() => openEdit(entry)} aria-label={`Editar ${describe(entry)}`}>
            Editar
          </Button>
        ),
    },
  ];

  const activeCosts = (fixedCosts.data ?? []).filter(
    (cost) => cost.end_month === null || cost.end_month >= today,
  );
  const settingsPending = fixedCosts.isPending || fee.isPending;
  const settingsFailed = fixedCosts.isError || fee.isError;
  const standardFee = fee.data ? priceInForce(fee.data.prices, today) : null;

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.month}>
          <Button onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior">
            ‹
          </Button>
          <h2 className={styles.monthName}>{monthTitle(month)}</h2>
          <Button onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês">
            ›
          </Button>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            onNew();
            setDialog("new");
          }}
        >
          + Nova despesa
        </Button>
      </div>

      {entries.isPending && <Loading />}
      {entries.isError && (
        <Banner tone="error">
          Não foi possível carregar as despesas.{" "}
          <Button onClick={() => void entries.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {entries.data && (
        <>
          <Table
            label={`Despesas de ${monthTitle(month)}`}
            columns={columns}
            rows={entries.data.entries}
            rowKey={(entry) => entry.id}
            empty={<EmptyState>Nenhuma despesa neste mês.</EmptyState>}
          />
          <p className={styles.total}>
            Total de {monthName(month).toLowerCase()}: {formatBrl(entries.data.total_cents)}
          </p>
        </>
      )}

      <section className={styles.settings} role="region" aria-labelledby={settingsId}>
        <h3 id={settingsId} className={styles.settingsTitle}>
          Configurações
        </h3>
        {settingsPending && <Loading />}
        {!settingsPending && settingsFailed && (
          <Banner tone="error">
            Não foi possível carregar as configurações.{" "}
            <Button
              onClick={() => {
                void fixedCosts.refetch();
                void fee.refetch();
              }}
            >
              Tentar de novo
            </Button>
          </Banner>
        )}
        {!settingsPending && !settingsFailed && (
          <>
            <p className={styles.settingsLine}>
              <span>
                Despesas fixas:{" "}
                {activeCosts.length === 0
                  ? "nenhuma"
                  : activeCosts
                      .map((cost) => {
                        const price = priceInForce(cost.prices, today);
                        return `${cost.name} ${price ? formatBrl(price.amount_cents) : "sem valor"}`;
                      })
                      .join(" · ")}
              </span>
              <Button onClick={onManage}>Gerenciar</Button>
            </p>
            <p className={styles.settingsLine}>
              <span>
                2º fotógrafo (padrão):{" "}
                {standardFee ? formatBrl(standardFee.amount_cents) : "não definido"}
              </span>
              <Button onClick={onManage}>Alterar</Button>
            </p>
          </>
        )}
      </section>
      {dialog && (
        <ExpenseDialog
          expenseId={dialog === "new" ? null : dialog.id}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
