import { currentMonth } from "../../../domain/instalments";
import { formatBrl } from "../../../domain/money";
import { Table, TextLink } from "../../../ui";
import { monthLabel, monthName } from "../groups";
import styles from "./ResumoTab.module.css";
import { formatSigned } from "./share";

type Row = {
  month: string;
  rest_of_month: boolean;
  in_cents: number;
  out_cents: number;
  projected_free_cents: number;
};

type Props = { rows: Row[]; lateCents: number };

export function UpcomingTable({ rows, lateCents }: Props) {
  const now = currentMonth();
  const label = (row: Row) =>
    row.rest_of_month
      ? `resto de ${monthName(row.month).toLowerCase()}`
      : monthLabel(row.month, now).toLowerCase();
  return (
    <div>
      <Table
        label="Próximos meses"
        rows={rows}
        rowKey={(row) => row.month}
        columns={[
          { header: "Mês", cell: label },
          { header: "A receber", align: "end", cell: (r) => formatBrl(r.in_cents) },
          { header: "A pagar", align: "end", cell: (r) => formatBrl(r.out_cents) },
          {
            header: "Livre previsto",
            align: "end",
            cell: (r) => formatSigned(r.projected_free_cents),
          },
        ]}
      />
      <p className={styles.note}>
        A receber = parcelas não pagas do mês · A pagar = despesas fixas + 2º fotógrafo
      </p>
      {lateCents > 0 && (
        <p className={styles.note}>
          Há {formatBrl(lateCents)} em parcelas atrasadas, que não entram nesta previsão.{" "}
          <TextLink to="/negocio">Ver parcelas</TextLink>
        </p>
      )}
    </div>
  );
}
