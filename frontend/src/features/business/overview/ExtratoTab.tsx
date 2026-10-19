import { useState } from "react";
import { useOverview } from "../../../api/overview";
import type { Schemas } from "../../../api/client";
import { currentMonth } from "../../../domain/instalments";
import { formatBrl, formatBrlAmount } from "../../../domain/money";
import { Banner, Loading } from "../../../ui";
import tableStyles from "../../../ui/Table.module.css";
import { coupleLabel } from "../../contracts/names";
import { describe } from "../expenses/describe";
import expenseStyles from "../expenses/ExpensesTab.module.css";
import { monthName, shortDate } from "../groups";
import { type Period, PeriodControl } from "../PeriodControl";
import styles from "./ExtratoTab.module.css";
import { formatSigned } from "./share";

type Row = Schemas["OverviewOut"]["statement"][number];

const COLUMNS = 5;

function Description({ row }: { row: Row }) {
  if (row.kind === "in") {
    const who = row.contract_deleted
      ? "(contrato excluído)"
      : coupleLabel({ full_name: row.groom_name }, { full_name: row.bride_name });
    return <>{`Parcela ${row.number}/${row.count} · ${who}`}</>;
  }
  const { entry } = row;
  return (
    <>
      {describe(entry)}
      {entry.source === "fixed" && <span className={expenseStyles.tag}>fixa</span>}
      {entry.source === "second_photographer" && (
        <span className={expenseStyles.tag}>automática</span>
      )}
    </>
  );
}

/** Each row with the balance after it, and whether it opens a new month. */
function withBalance(rows: Row[], opening: number) {
  let balance = opening;
  return rows.map((row, i) => {
    balance += row.kind === "in" ? row.amount_cents : -row.amount_cents;
    return {
      row,
      balance,
      newMonth: i === 0 || row.date.slice(0, 7) !== rows[i - 1]?.date.slice(0, 7),
    };
  });
}

/** An amount without the currency prefix, as the table columns show it. */
const plain = (cents: number) => formatSigned(cents).replace("R$ ", "");

export function ExtratoTab() {
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", value: currentMonth() }));
  const overview = useOverview(period.kind, period.value);
  const data = overview.data;

  const body = withBalance(data?.statement ?? [], data?.opening_cents ?? 0).flatMap(
    ({ row, balance, newMonth }, index) => {
      const nodes = [];
      if (period.kind === "year" && newMonth) {
        const month = row.date.slice(0, 7);
        nodes.push(
          <tr key={`month-${month}`}>
            <th colSpan={COLUMNS} scope="colgroup" className={styles.month}>
              {monthName(month).toLowerCase()}
            </th>
          </tr>,
        );
      }
      nodes.push(
        <tr key={`row-${index}`}>
          <td>{period.kind === "year" ? shortDate(row.date) : row.date.slice(8, 10)}</td>
          <td className={tableStyles.wrapText}>
            <Description row={row} />
          </td>
          <td className={tableStyles.end}>
            {row.kind === "in" ? formatBrlAmount(row.amount_cents) : ""}
          </td>
          <td className={tableStyles.end}>
            {row.kind === "out"
              ? row.entry.missing_amount
                ? "— sem valor"
                : formatBrlAmount(row.amount_cents)
              : ""}
          </td>
          <td className={tableStyles.end}>{plain(balance)}</td>
        </tr>,
      );
      return nodes;
    },
  );

  return (
    <div className={styles.page}>
      <PeriodControl value={period} onChange={setPeriod} />
      {overview.isError && <Banner tone="error">Não foi possível carregar o extrato.</Banner>}
      {!data && !overview.isError && <Loading />}
      {data?.not_started && (
        <p className={styles.note}>Este período ainda não começou — veja Próximos meses.</p>
      )}
      {data && !data.not_started && data.statement.length === 0 && (
        <p className={styles.note}>Nada entrou ou saiu neste período.</p>
      )}
      {data && !data.not_started && data.statement.length > 0 && (
        <>
          <div className={tableStyles.wrap} role="region" aria-label="Extrato" tabIndex={0}>
            <table className={tableStyles.table}>
              <caption className={tableStyles.caption}>Extrato</caption>
              <thead>
                <tr>
                  <th scope="col">Dia</th>
                  <th scope="col">Descrição</th>
                  <th scope="col" className={tableStyles.end}>
                    Entrada
                  </th>
                  <th scope="col" className={tableStyles.end}>
                    Saída
                  </th>
                  <th scope="col" className={tableStyles.end}>
                    Livre
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className={tableStyles.muted}>
                  <td colSpan={COLUMNS - 1}>Saldo anterior</td>
                  <td className={tableStyles.end}>{plain(data.opening_cents)}</td>
                </tr>
                {body}
              </tbody>
            </table>
          </div>
          <p className={styles.total}>
            {`Entrou ${formatBrl(data.in_cents)} · Saiu ${formatBrl(data.out_cents)}`}
          </p>
        </>
      )}
    </div>
  );
}
