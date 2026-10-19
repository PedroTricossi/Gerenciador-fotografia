import { useState } from "react";
import { currentMonth } from "../../../domain/instalments";
import { useOverview } from "../../../api/overview";
import { Banner, Loading } from "../../../ui";
import { type Period, PeriodControl } from "../PeriodControl";
import styles from "./ResumoTab.module.css";
import { SpendBar } from "./SpendBar";
import { UpcomingTable } from "./UpcomingTable";
import { formatSigned } from "./share";

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.big}>{formatSigned(cents)}</div>
    </div>
  );
}

export function ResumoTab() {
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", value: currentMonth() }));
  const overview = useOverview(period.kind, period.value);
  const data = overview.data;

  return (
    <div className={styles.page}>
      <PeriodControl value={period} onChange={setPeriod} />
      {overview.isError && <Banner tone="error">Não foi possível carregar o resumo.</Banner>}
      {!data && !overview.isError && <Loading />}
      {data && (
        <>
          {data.not_started ? (
            <p className={styles.note}>Este período ainda não começou.</p>
          ) : (
            <>
              <div className={styles.cards}>
                <Total label="Entrou" cents={data.in_cents} />
                <Total label="Saiu" cents={data.out_cents} />
                <Total
                  label={period.kind === "month" ? "Livre no mês" : "Livre no ano"}
                  cents={data.in_cents - data.out_cents}
                />
              </div>
              <section className={styles.box} aria-labelledby="spend-title">
                <h3 id="spend-title" className={styles.cardLabel}>
                  Para onde foi o que entrou
                </h3>
                <SpendBar byType={data.by_type} inCents={data.in_cents} outCents={data.out_cents} />
              </section>
              {data.missing_fee_count > 0 && (
                <p className={styles.note}>
                  {data.missing_fee_count === 1
                    ? "1 contrato está"
                    : `${data.missing_fee_count} contratos estão`}{" "}
                  sem o valor do 2º fotógrafo definido; essa saída ainda não entrou na conta.
                </p>
              )}
            </>
          )}
          <section className={styles.box} aria-labelledby="free-title">
            <h3 id="free-title" className={styles.cardLabel}>
              Livre hoje (tudo o que já entrou − tudo o que já saiu)
            </h3>
            <div
              className={
                data.free_today_cents < 0 ? `${styles.big} ${styles.negative}` : styles.big
              }
            >
              {data.free_today_cents < 0 && <span aria-hidden="true">⚠ </span>}
              {formatSigned(data.free_today_cents)}
            </div>
          </section>
          <section className={styles.box}>
            <UpcomingTable rows={data.upcoming} lateCents={data.late_cents} />
          </section>
        </>
      )}
      {/* Room for the transport price guide (Task 7). */}
      <div data-slot="transport-guide" />
    </div>
  );
}
