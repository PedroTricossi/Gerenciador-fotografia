import { useAgenda } from "../../api/agenda";
import { EmptyState, SegmentedControl } from "../../ui";
import styles from "./Agenda.module.css";
import { addDays, dayHeading } from "./agendaDates";
import { useChoice } from "./choices";
import { EntryList } from "./EntryList";
import { groupByDate } from "./entries";
import { LoadState } from "./LoadState";

const RANGES = [
  { value: "30", label: "Próximos 30 dias" },
  { value: "90", label: "Próximos 90 dias" },
] as const;
type Range = (typeof RANGES)[number]["value"];

export function AgendaList({ today }: { today: string }) {
  const [range, setRange] = useChoice<Range>("gerenciador.agenda.range", ["30", "90"], "30");
  const agenda = useAgenda(today, addDays(today, Number(range)));

  return (
    <>
      <div className={styles.toolbar}>
        <SegmentedControl label="Período" options={RANGES} value={range} onChange={setRange} />
      </div>
      <LoadState query={agenda} />
      {agenda.isSuccess && agenda.data.length === 0 && (
        <EmptyState>Nenhum ensaio ou casamento nos próximos {range} dias.</EmptyState>
      )}
      {agenda.isSuccess &&
        groupByDate(agenda.data).map(([date, entries]) => (
          <section key={date} aria-label={dayHeading(date, today)} className={styles.day}>
            <h2 className={styles.dayTitle}>{dayHeading(date, today)}</h2>
            <EntryList entries={entries} />
          </section>
        ))}
    </>
  );
}
