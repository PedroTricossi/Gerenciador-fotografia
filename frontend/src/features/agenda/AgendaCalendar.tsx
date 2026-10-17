import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAgenda } from "../../api/agenda";
import type { AgendaEntryOut } from "../../api/client";
import { Button } from "../../ui";
import { coupleLabel } from "../contracts/names";
import styles from "./AgendaCalendar.module.css";
import {
  type Month,
  dayHeading,
  dayLabel,
  monthGrid,
  monthOf,
  monthTitle,
  shiftMonth,
} from "./agendaDates";
import { EntryList } from "./EntryList";
import { entryKey, entryLabel, groupByDate, timeLabel } from "./entries";
import { LoadState } from "./LoadState";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const VISIBLE_CHIPS = 3;

function weeksOf(days: string[]): string[][] {
  const weeks: string[][] = [];
  for (let start = 0; start < days.length; start += 7) weeks.push(days.slice(start, start + 7));
  return weeks;
}

type DayProps = {
  day: string;
  month: Month;
  today: string;
  entries: AgendaEntryOut[];
  onOpen: (day: string) => void;
};

function Day({ day, month, today, entries, onOpen }: DayProps) {
  const shown = entries.slice(0, VISIBLE_CHIPS);
  const hidden = entries.length - shown.length;
  const className = [
    styles.day,
    monthOf(day).month !== month.month ? styles.outside : "",
    day === today ? styles.today : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td className={className} aria-current={day === today ? "date" : undefined}>
      <button
        type="button"
        className={styles.number}
        aria-label={dayLabel(day)}
        onClick={() => onOpen(day)}
      >
        {Number(day.slice(8, 10))}
        {entries.length > 0 && <span className={styles.dot} aria-hidden="true" />}
      </button>
      {shown.length > 0 && (
        <ul className={styles.chips}>
          {shown.map((entry) => (
            <li key={entryKey(entry)} className={styles.chip}>
              {(entry.kind === "prewedding" || entry.start_time) && (
                <span className={styles.chipMeta}>
                  {[
                    entry.kind === "prewedding" && "Pré ·",
                    entry.start_time && timeLabel(entry.start_time),
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              )}
              <Link
                to={`/contratos/${entry.contract_id}`}
                className={styles.chipLink}
                aria-label={entryLabel(entry)}
                title={entryLabel(entry)}
              >
                {coupleLabel(entry.groom, entry.bride)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => onOpen(day)}>
          +{hidden} mais
        </button>
      )}
    </td>
  );
}

export function AgendaCalendar({ today }: { today: string }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [opened, setOpened] = useState<string | null>(null);
  const days = monthGrid(month);
  const agenda = useAgenda(days[0]!, days[days.length - 1]!);
  const byDate = new Map(groupByDate(agenda.data ?? []));
  const openedEntries = opened ? (byDate.get(opened) ?? []) : [];
  const title = monthTitle(month);
  const selected = useRef<HTMLElement>(null);
  const hasSelected = opened !== null && openedEntries.length > 0;

  useEffect(() => {
    if (hasSelected) selected.current?.scrollIntoView?.({ block: "nearest" });
  }, [hasSelected, opened]);

  const show = (next: Month) => {
    setMonth(next);
    setOpened(null);
  };

  return (
    <>
      <div className={styles.header}>
        <Button aria-label="Mês anterior" onClick={() => show(shiftMonth(month, -1))}>
          ‹
        </Button>
        <h2 className={styles.title}>{title}</h2>
        <Button aria-label="Próximo mês" onClick={() => show(shiftMonth(month, 1))}>
          ›
        </Button>
        <Button onClick={() => show(monthOf(today))}>Hoje</Button>
      </div>
      <LoadState query={agenda} />
      <table className={styles.grid} aria-label={title}>
        <thead>
          <tr>
            {WEEKDAYS.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(days).map((week) => (
            <tr key={week[0]}>
              {week.map((day) => (
                <Day
                  key={day}
                  day={day}
                  month={month}
                  today={today}
                  entries={byDate.get(day) ?? []}
                  onOpen={setOpened}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {opened && openedEntries.length > 0 && (
        <section ref={selected} aria-label={dayHeading(opened, today)} className={styles.selected}>
          <h3 className={styles.selectedTitle}>{dayHeading(opened, today)}</h3>
          <EntryList entries={openedEntries} />
        </section>
      )}
    </>
  );
}
