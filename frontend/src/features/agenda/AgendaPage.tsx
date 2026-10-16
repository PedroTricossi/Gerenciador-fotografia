import { todayIso } from "../../domain/dates";
import { PageLayout } from "../../ui";
import { AgendaList } from "./AgendaList";

export function AgendaPage() {
  return (
    <PageLayout title="Agenda">
      <AgendaList today={todayIso()} />
    </PageLayout>
  );
}
