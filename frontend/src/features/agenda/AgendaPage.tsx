import { useEffect, useState } from "react";
import { todayIso } from "../../domain/dates";
import { PageLayout, SegmentedControl } from "../../ui";
import styles from "./Agenda.module.css";
import { AgendaCalendar } from "./AgendaCalendar";
import { AgendaList } from "./AgendaList";
import { useChoice } from "./choices";

const VIEWS = [
  { value: "list", label: "Lista" },
  { value: "calendar", label: "Calendário" },
] as const;
type View = (typeof VIEWS)[number]["value"];

export function AgendaPage() {
  const [view, setView] = useChoice<View>("gerenciador.agenda.view", ["list", "calendar"], "list");
  const [today, setToday] = useState(todayIso);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setToday(todayIso());
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <PageLayout title="Agenda">
      <div className={styles.toolbar}>
        <SegmentedControl label="Visualização" options={VIEWS} value={view} onChange={setView} />
      </div>
      {view === "list" ? <AgendaList today={today} /> : <AgendaCalendar today={today} />}
    </PageLayout>
  );
}
