import { todayIso } from "../../domain/dates";
import { PageLayout } from "../../ui";
import styles from "./Agenda.module.css";
import { AgendaCalendar } from "./AgendaCalendar";
import { AgendaList } from "./AgendaList";
import { Choice } from "./Choice";
import { useChoice } from "./choices";

const VIEWS = [
  { value: "list", label: "Lista" },
  { value: "calendar", label: "Calendário" },
] as const;
type View = (typeof VIEWS)[number]["value"];

export function AgendaPage() {
  const [view, setView] = useChoice<View>("gerenciador.agenda.view", ["list", "calendar"], "list");
  const today = todayIso();

  return (
    <PageLayout title="Agenda">
      <div className={styles.toolbar}>
        <Choice label="Visualização" options={VIEWS} value={view} onChange={setView} />
      </div>
      {view === "list" ? <AgendaList today={today} /> : <AgendaCalendar today={today} />}
    </PageLayout>
  );
}
