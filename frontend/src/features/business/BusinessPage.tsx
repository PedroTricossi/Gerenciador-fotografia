import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import {
  type MarkTarget,
  instalmentKeys,
  useInstalments,
  useMarkPaid,
  useMarkUnpaid,
} from "../../api/instalments";
import { todayIso } from "../../domain/dates";
import { currentMonth } from "../../domain/instalments";
import { formatBrl } from "../../domain/money";
import { Banner, Button, EmptyState, Loading, PageLayout, TextLink, useToast } from "../../ui";
import { coupleLabel } from "../contracts/names";
import styles from "./BusinessPage.module.css";
import { type InstalmentItem, groupInstalments, monthLabel, monthName, shortDate } from "./groups";

const ALREADY_UPDATED = "Esta parcela já estava atualizada.";

const rowKey = (item: MarkTarget | InstalmentItem) =>
  `${"contractId" in item ? item.contractId : item.contract_id}:${item.number}`;

type RowProps = {
  item: InstalmentItem;
  late?: boolean;
  busy: boolean;
  currentMonth: string;
  onMark: (item: InstalmentItem) => void;
  onUndo: (item: InstalmentItem) => void;
};

function InstalmentRow({ item, late = false, busy, currentMonth, onMark, onUndo }: RowProps) {
  const couple = coupleLabel({ full_name: item.groom_name }, { full_name: item.bride_name });
  return (
    <li className={styles.row}>
      <span className={styles.main}>
        <TextLink to={`/contratos/${item.contract_id}`}>{couple}</TextLink>
        <span>
          {item.number}/{item.count}
        </span>
        <span>{monthLabel(item.month, currentMonth)}</span>
        <span className={styles.amount}>{formatBrl(item.amount_cents)}</span>
        {late && (
          <span className={styles.late}>
            <span aria-hidden="true">⚠</span> Atrasada
          </span>
        )}
        {item.plan_needs_review && <span className={styles.badge}>Revisar plano</span>}
      </span>
      {item.paid_on ? (
        <span className={styles.status}>
          <span>✓ paga em {shortDate(item.paid_on)}</span>
          <Button onClick={() => onUndo(item)} busy={busy}>
            Desfazer
          </Button>
        </span>
      ) : (
        <Button onClick={() => onMark(item)} busy={busy}>
          Marcar como paga
        </Button>
      )}
    </li>
  );
}

type GroupProps = Omit<RowProps, "item" | "busy"> & { items: InstalmentItem[]; headingId: string };

function RowList({ items, headingId, ...row }: GroupProps & { busyKeys: Set<string> }) {
  return (
    <ul className={styles.list} aria-labelledby={headingId}>
      {items.map((item) => (
        <InstalmentRow
          key={rowKey(item)}
          item={item}
          {...row}
          busy={row.busyKeys.has(rowKey(item))}
        />
      ))}
    </ul>
  );
}

export function BusinessPage() {
  const notify = useToast();
  const client = useQueryClient();
  const instalments = useInstalments();
  const markPaid = useMarkPaid();
  const markUnpaid = useMarkUnpaid();
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  // State lags a render behind a fast second click; the ref closes that gap.
  const inFlight = useRef(new Set<string>());
  const ids = { late: useId(), month: useId() };
  const upcomingId = useId();

  const onError = (error: unknown) => {
    if (!(error instanceof ApiError)) return;
    if (error.status === 409 || error.status === 404) {
      notify(ALREADY_UPDATED, { tone: "info" });
      void client.invalidateQueries({ queryKey: instalmentKeys.all });
    } else if (!isUnexpected(error)) {
      // Unexpected errors are already toasted globally.
      notify(describeUnexpected(error), { tone: "error" });
    }
  };

  const run = async (item: InstalmentItem, call: (target: MarkTarget) => Promise<unknown>) => {
    const key = rowKey(item);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBusyKeys(new Set(inFlight.current));
    try {
      await call({ contractId: item.contract_id, number: item.number });
    } catch (error) {
      onError(error);
    } finally {
      inFlight.current.delete(key);
      setBusyKeys(new Set(inFlight.current));
    }
  };

  const onMark = (item: InstalmentItem) =>
    void run(item, (target) => markPaid.mutateAsync({ ...target, paidOn: todayIso() }));
  const onUndo = (item: InstalmentItem) =>
    void run(item, (target) => markUnpaid.mutateAsync(target));

  const month = currentMonth();
  const groups = instalments.data ? groupInstalments(instalments.data, month) : null;
  const isEmpty =
    groups !== null &&
    groups.late.length === 0 &&
    groups.thisMonth.length === 0 &&
    groups.upcoming.length === 0;
  const shared = { busyKeys, onMark, onUndo, currentMonth: month };

  return (
    <PageLayout title="Negócio">
      <h2 className={styles.section}>Parcelas</h2>
      {instalments.isPending && <Loading />}
      {instalments.isError && (
        <Banner tone="error">
          Não foi possível carregar as parcelas.{" "}
          <Button onClick={() => void instalments.refetch()}>Tentar de novo</Button>
        </Banner>
      )}
      {isEmpty && <EmptyState>Nenhuma parcela por aqui.</EmptyState>}
      {groups && groups.late.length > 0 && (
        <section className={styles.group}>
          <h3 id={ids.late}>Atrasadas</h3>
          <RowList items={groups.late} headingId={ids.late} late {...shared} />
        </section>
      )}
      {groups && groups.thisMonth.length > 0 && (
        <section className={styles.group}>
          <h3 id={ids.month}>{monthName(month)}</h3>
          <RowList items={groups.thisMonth} headingId={ids.month} {...shared} />
        </section>
      )}
      {groups && groups.upcoming.length > 0 && (
        <section className={styles.group}>
          <h3 id={upcomingId}>Próximos meses</h3>
          {groups.upcoming.map((entry) => (
            <div key={entry.month}>
              <h4 id={`${upcomingId}-${entry.month}`} className={styles.monthHeading}>
                {monthLabel(entry.month, month)}
              </h4>
              <RowList items={entry.items} headingId={`${upcomingId}-${entry.month}`} {...shared} />
            </div>
          ))}
        </section>
      )}
    </PageLayout>
  );
}
